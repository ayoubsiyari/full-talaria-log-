#!/usr/bin/env node
/**
 * SEALED TWO-ARM SOAK — the harness tomorrow's confirmation run starts from.
 *
 * Built to DETACH-01 and SOAK-SEAL, and shaped by every way tonight's runs died:
 *
 *  - DETACHED: launched so its parent is WmiPrvSE, not an editor's console. Two runs died to an editor
 *    crash cascading into the process tree.
 *  - APPEND AS TAKEN: every sample is an fsync'd JSONL line. Five hours of samples lived only in memory
 *    when the first run died.
 *  - HEARTBEAT: written per sample, write-then-rename, so a reader can tell ALIVE from COMPLETED from
 *    DEAD OR STALLED without a process to inspect.
 *  - AUTO-RESUME: a dead browser is re-booted and the run continues, but the resume is recorded as a
 *    SEGMENT BOUNDARY, because a new browser resets the very quantity the slope is measured over. Tonight's
 *    segment 2 taught this: continuing silently would have produced one series across two populations.
 *  - SEALED: badge AND digest of the served bytes captured at start and RE-VERIFIED every sample. A build
 *    re-cut under the same label mid-run voids the run instead of contaminating it.
 *  - PANEL TRUTH: liveness is judged on the PLAYHEAD, not the bar count. The bar-count route reads 1 of 4
 *    on a healthy CONF-01 and has produced a false void twice.
 *  - MEASURES THE THING IT EXISTS TO MEASURE. The first version of this harness recorded bar counts, panel
 *    liveness and the seal digest, and NO MEMORY AND NO LAG. Ten hours of it would have produced a sealed,
 *    crash-proof, perfectly reproducible series of bar counts and not one number the programme is about.
 *    footprintTotalMB appears in eleven other scripts in this folder and was absent from the one long run
 *    that matters. Both gauges are now on the SAME instruments as every published figure: OS private
 *    footprint summed over the browser's processes (the gauge behind the 2,747.6 / 2,709.3 MB matched-bars
 *    comparison) with the renderer split, and blocking ms/s from a longtask observer with the same
 *    pre-window exclusion and the same physical invariant that caught three of my own defects.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openRun, inspectRun } from './lib/detach01.mjs';
import { bootConf01Session, cycleTrades } from './lib/conf01-session.mjs';
import {
  HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
  computeRequiredRunwayMs,
} from './lib/heap-cycle-dataset-config.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { reapOrphanedRenderers } from './lib/find-soak-port.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { perBarFields, evaluateGauges } from './lib/soak-gauges.mjs';
import { readBuildInfo, shaChanged } from './lib/build-info.mjs';
import { computeSeal } from './lib/seal.mjs';
import { checkSpeed01Served, capabilityDigest, readSpeed01Runtime } from './lib/served-capability.mjs';
import { deliveredRate, evaluateRateHold, readEffectiveRateReadback } from './lib/rate-hold.mjs';
import { forcedGcPauseProbe } from './lib/forced-gc-pause-probe.mjs';
import { arenaColumns } from './lib/arena-columns.mjs';
import { collectMemoryDump } from './process-memory-census.mjs';
import { readStorageCensus, diffStorage } from './lib/storage-census.mjs';
import { offlineToggle } from './lib/offline-toggle.mjs';
import { readHostHealth } from './lib/host-health.mjs';
import { installLoafCensus, readLoafCensus } from './lib/loaf-census.mjs';
import { evaluateR3, readOldestOpenPositionAge } from './lib/r3-falsifier.mjs';
import { takeEndOfArmSnapshot } from './lib/end-of-arm-snapshot.mjs';
import { assertHeapCap } from './lib/heap-cap.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM = argOf('arm', 'trades');                 // trades | zerotrade
const HOURS = Number(argOf('hours', '10'));
const SAMPLE_MS = Number(argOf('sampleMs', '180000'));
/**
 * SPEED-01 ENVELOPE. The ladder is the integers 1 through 10 as BARS PER SECOND — nothing above 10 and
 * nothing between. The default was 60 for the whole of this harness's life and 60 is no longer a speed
 * the product offers.
 *
 * WHY A STALE VALUE IS WORSE THAN A BROKEN ONE HERE. Migration is a nearest-rung SNAP, not a rejection:
 * ask for 60 and the engine quietly gives you 10. So a forgotten `--speed=60` does not fail, it runs a
 * correct ten-hour arm and writes 60 into every record of it. That is the same defect that ran a soak at
 * 60 under a 5x label - a speed argument silently discarded - and it cost that entire run.
 *
 * CORRECTED after measuring: I first wrote here that the UNIT changed with the ladder. It did not. The
 * slider was already candles per second - my own S1 finding has the engine intending 1.00 candles/s at
 * 1x - so SPEED-01 narrowed the RANGE and left the unit alone.
 *
 * That matters for what this arm will collect. Speed 60 meant 60 bars/s REQUESTED and delivered only
 * ~12.8, starved to a fifth. Speed 10 delivered 9.54 on the b121 shakeout, 95% of request. So the new
 * envelope costs about a quarter of the old DELIVERED throughput, not six-sevenths of it, and per-bar
 * figures from the speed-60 runs stay comparable with what this arm will produce.
 */
const SPEED_LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SPEED = Number(argOf('speed', '10'));
const CLOSES_PER_HOUR = Number(argOf('closesPerHour', '20'));
/**
 * CONF01-COMMON-WINDOW-V1: the market time this arm will consume, computed from its own knobs
 * rather than assumed. The host panel is 1m under same-symbol, so each bar is 60 market seconds.
 * Passed to the boot gate so the artifact records how far the run outruns its data.
 */
const REQUIRED_RUNWAY_MS = computeRequiredRunwayMs({
  wallMs: HOURS * 3_600_000,
  barsPerSecond: SPEED,
  barSeconds: 60,
});
const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = argOf('out', path.join(EV, `SEALED-SOAK-${ARM.toUpperCase()}.jsonl`));
const EXPECT_DIGEST = argOf('expectDigest', '');    // set to pin the run to one build
const EXPECT_SHA = argOf('expectSha', '');          // PASSPORT-3: pin the run to one SOURCE COMMIT
const REQUIRE_SHA = argOf('requireSha', '1') !== '0';
const HEAP_CAP_MB = Number(argOf('heapCapMB', '1024'));
// Declared rather than inferred: the R3 falsifier only predicts a plateau when eviction is actually on,
// and reporting MODEL_VOID against a build without the fix would be a verdict on nothing.
const EVICTION_ACTIVE = argOf('evictionActive', '0') === '1';
const SNAPSHOT_AT_END = argOf('endSnapshot', '1') !== '0';
const SNAPSHOT_CAP_MB = Number(argOf('snapshotCapMB', '4096'));
// N3 rides the smoke, not the ten-hour arms: an outage deliberately punched into a run whose verdict IS
// delivery rate would put a hole in the series that verdict is computed from.
const OFFLINE_PROBE = argOf('offlineProbe', '0') === '1';

// TOOL-01, asserted before anything expensive is opened. A cap that was requested but never applied is
// worse than no cap, because the launch line in the log looks correct.
const heapCap = assertHeapCap({ capMB: HEAP_CAP_MB, label: `sealed-soak-${ARM}` });

// SPEED-01, asserted in the same place and for the same reason. Refused here rather than annotated at
// segment start, because by then a browser is up, the arm has begun, and the only remedy on offer is a
// warning inside an artifact nobody reads until the run is over.
if (!SPEED_LADDER.includes(SPEED)) {
  console.error(`REFUSING TO START: --speed=${argOf('speed', '10')} is not on the SPEED-01 ladder.`);
  console.error(`  Valid speeds are the integers ${SPEED_LADDER[0]} to ${SPEED_LADDER[SPEED_LADDER.length - 1]}, in BARS PER SECOND. Nothing above ${SPEED_LADDER[SPEED_LADDER.length - 1]}, nothing between.`);
  console.error('  This is refused rather than clamped BECAUSE the product clamps: migration snaps to the nearest rung,');
  console.error('  so an out-of-range request returns a working run whose every record names a speed it never ran at.');
  process.exit(6);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.error(`[soak:${ARM} ${new Date().toISOString()}] ${m}`);

// Identical to build-passport.mjs, in the same order. A digest is only comparable across tools if the path
// set is: my first version hashed four paths and produced a different digest for the same build than the
// passport's six, which would have looked like a seal break tomorrow.
// Imported, not restated. Two copies of this list already produced two digests for one build.

// Defaults to ORIGIN, so a real soak runs the identical code path and there is no test-only branch here.
// A dress rehearsal points it at a local mirror it can mutate, which is the only way to exercise mid-run
// seal drift without changing production bytes. When the two differ the run is stamped REHEARSAL and its
// artifact is not publishable - a rehearsal must never be mistakable for a measurement.
const SEAL_ORIGIN = String(argOf('sealOrigin', ORIGIN)).replace(/\/$/, '');
const IS_REHEARSAL = SEAL_ORIGIN !== ORIGIN;

const passport = () => computeSeal(SEAL_ORIGIN);

/**
 * Bars/s is meaningless without saying bars of WHAT. The host panel's own timeframe is the denominator,
 * derived from the engine's label rather than assumed to be 1m — the PO recipe runs mixed timeframes, and
 * a hard-coded 60 would silently report a 15m panel's delivery at 15x its true rate.
 */
function tfSeconds(tf) {
  if (tf == null) return null;
  const s = String(tf).trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|m|h|d|w)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] || 'm';
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[unit];
  return mult ? n * mult : null;
}

/**
 * ARENA-COLUMNS (checklist item 1) on E's memory-infra dump path, flattened to soak-row columns.
 *
 * The total passed in is the SAME `footprintTotalMB` gauge every published figure uses, so TOTAL-01's
 * total row and the memory series cannot drift apart. A dump failure returns null columns with the
 * total still present rather than omitting the columns, because a row that changes shape mid-run is
 * how a series quietly stops being one series.
 */
async function readArenaColumns(browser, totalPrivateMB = null) {
  let browserCdp = null;
  try {
    browserCdp = await browser.target().createCDPSession();
    const byPid = await collectMemoryDump(browserCdp);
    let heaviest = null;
    for (const [pid, roots] of byPid) {
      const score = (roots?.v8 || 0) + (roots?.partition_alloc || 0) + (roots?.blink_gc || 0);
      if (!heaviest || score > heaviest.score) heaviest = { pid, score, roots };
    }
    return {
      ...arenaColumns(heaviest?.roots || null, { totalPrivateMB }),
      arenaDumpPid: heaviest?.pid ?? null,
      arenaDumpProcesses: byPid.size,
    };
  } catch (e) {
    return {
      ...arenaColumns(null, { totalPrivateMB }),
      arenaDumpPid: null,
      arenaDumpProcesses: 0,
      arenaDumpError: String(e?.message || e).slice(0, 140),
    };
  } finally {
    try { if (browserCdp) await browserCdp.detach(); } catch (_) { /* session already gone */ }
  }
}

/** Liveness by playhead, with bar count recorded alongside so the two routes can be compared. */
async function readPanels(page) {
  const rows = [];
  for (const f of page.frames()) {
    const r = await f.evaluate(() => {
      const ch = window.chart;
      if (!ch) return null;
      const rs = ch.replaySystem;
      return {
          isHost: window.top === window,
          // The engine field is currentTimeframe. conf01-session.mjs:58 already reads it correctly; this
          // script asked for ch.timeframe, which does not exist, so every segment marker recorded
          // [null,null,null,null] while asserting "4 panels with distinct datasets". A panel that silently
          // changed timeframe mid-run would have been invisible in the artifact that exists to catch it.
          tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : (ch.timeframe ?? null),
        bars: Array.isArray(ch.data) ? ch.data.length : 0,
        playhead: [rs?.replayTimestamp, rs?.currentTime, rs?.replayIndex].map(Number).find((v) => Number.isFinite(v)) ?? null,
        // RATE-HOLD needs a quantity whose UNIT is known. The `playhead` field above is whichever of
        // three fields answered first - epoch milliseconds or a bar index - which is fine for "did it
        // move" and catastrophic for "how fast". Kept separate and named.
        playheadMs: Number.isFinite(Number(rs?.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
        replayIndex: Number.isFinite(Number(rs?.currentIndex)) ? Number(rs.currentIndex)
          : (Number.isFinite(Number(rs?.replayIndex)) ? Number(rs.replayIndex) : null),
        playing: !!rs?.isPlaying,
      };
    }).catch(() => null);
    if (r) rows.push(r);
  }
  return rows;
}

  /**
   * Memory on the SAME gauge as every published figure: OS private working set summed over every process
   * the browser owns, via SystemInfo.getProcessInfo -> Get-Process. Not performance.memory (one isolate,
   * live objects only, blind to V8's committed arena) and not a CDP heap number. This is the gauge behind
   * the 2,747.6 / 2,709.3 MB matched-bars comparison, so this soak's slope is comparable to it directly.
   *
   * The renderer split rides along because 96.8% of renderer memory sits in ONE process here, and a total
   * that silently became four-way would change what the number means without changing its value.
   */
  // readFootprint now lives in lib/footprint.mjs. N1 must read the SAME gauge as the soak: a
  // heavy-vs-fresh comparison across two subtly different implementations would measure the
  // difference between the implementations.

  /**
   * Blocking ms/s on the same definition as the trace calibration and the twelve-minute frequency run:
   * sum of (duration - 50) over main-thread tasks longer than 50 ms, divided by observed seconds.
   *
   * Installed and DISCONNECTED per sample. Over ten hours a persistent observer would accumulate entries
   * inside the very process whose memory slope is the measurement - the instrument would become the leak.
   */
  /**
   * Host frame rate, counted from requestAnimationFrame over a short window.
   *
   * FRAME-01 caps playback at 30 fps. If bar advance is coupled to paint at all, that cap becomes a
   * ceiling on delivered bars/s - the exact number RATE-HOLD grades - and at 10 bars/s requested there
   * is nominally headroom. The danger is not the cap itself but the cap PLUS dropped frames: if a bar
   * advances once per rendered frame and the frame rate sags under load, delivery falls below the
   * requested rate and the soak records a decay that is a paint artefact rather than a memory effect.
   *
   * Counted rather than inferred, and nothing is wrapped: wrapping render() to count paints would put
   * my instrument inside the hot path I am measuring for ten hours. rAF observes from outside.
   */
  async function measureFrameRate(page, windowMs = 3000) {
    try {
      return await page.evaluate((ms) => new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => { frames += 1; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else finish(); };
        const finish = () => {
          const elapsed = (performance.now() - t0) / 1000;
          resolve({ hostFramesPerSec: elapsed > 0 ? +(frames / elapsed).toFixed(2) : null, framesCounted: frames, windowSec: +elapsed.toFixed(2) });
        };
        requestAnimationFrame(tick);
        // A backstop, because a fully starved main thread never fires rAF at all and this would then
        // hang the sample loop rather than reporting the starvation it exists to detect.
        setTimeout(() => { if (frames === 0) resolve({ hostFramesPerSec: 0, framesCounted: 0, windowSec: ms / 1000, note: 'no animation frame fired in the window' }); }, ms + 2000);
      }), windowMs);
    } catch (err) {
      return { hostFramesPerSec: null, frameRateNote: String(err).slice(0, 100) };
    }
  }

  async function measureBlocking(page, windowMs) {
    const installed = await page.evaluate(() => {
      if (window.__C_SOAK_LT) return 'already-installed';
      window.__C_SOAK_LT = { entries: [], dropped: 0, startedAt: performance.now() };
      window.__C_SOAK_LT.observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          // Start times kept, not just durations: buffered:true replays entries from before the window and
          // dividing those by the window length once produced 1,019 ms/s - more than a second of work per
          // second. They are identifiable here and excluded below.
          if (window.__C_SOAK_LT.entries.length < 5000) window.__C_SOAK_LT.entries.push([Math.round(e.startTime), Math.round(e.duration)]);
          else window.__C_SOAK_LT.dropped += 1;
        }
      });
      window.__C_SOAK_LT.observer.observe({ type: 'longtask', buffered: true });
      return 'installed';
    }).catch((e) => `install-failed: ${String(e && e.message).slice(0, 80)}`);
    if (!/installed/.test(installed)) return { blockingMsPerSec: null, blockingNote: installed };

    await sleep(windowMs);

    const got = await page.evaluate(() => {
      const lt = window.__C_SOAK_LT;
      if (!lt) return null;
      const out = { entries: lt.entries.slice(), dropped: lt.dropped, startedAt: lt.startedAt, observedMs: performance.now() - lt.startedAt };
      try { lt.observer.disconnect(); } catch { /* already gone */ }
      delete window.__C_SOAK_LT;
      return out;
    }).catch(() => null);
    if (!got || !Array.isArray(got.entries)) return { blockingMsPerSec: null, blockingNote: 'observer produced no readable result' };

    const live = got.entries.filter(([st]) => st >= got.startedAt);
    const d = live.map(([, du]) => du);
    const sec = got.observedMs / 1000;
    const blocking = sec > 0 ? +(d.reduce((s, x) => s + Math.max(0, x - 50), 0) / sec).toFixed(1) : null;
    const totalLt = sec > 0 ? +(d.reduce((s, x) => s + x, 0) / sec).toFixed(1) : null;
    // One thread cannot spend more than 1,000 ms of every second inside tasks. Violating it means the
    // measurement is wrong, not that the page is slow.
    const possible = (totalLt ?? 0) <= 1000;
    return {
      blockingMsPerSec: possible ? blocking : null,
      totalLongTaskMsPerSec: possible ? totalLt : null,
      longTasksOver500: d.filter((x) => x > 500).length,
      longTasksOver50: d.length,
      blockingWindowSec: +sec.toFixed(1),
      blockingPreWindowExcluded: got.entries.length - live.length,
      blockingEntriesDropped: got.dropped,
      blockingNote: possible ? null : `IMPOSSIBLE READING VOIDED: ${totalLt} ms/s of long-task time in one second on one thread. Recorded as null rather than published.`,
    };
  }

  const readClosed = (page) => page.evaluate(() => {
    const om = (window.chart && window.chart.orderManager) || window.orderManager;
  return om && Array.isArray(om.closedPositions) ? om.closedPositions.length : null;
}).catch(() => null);

const seal = await passport();
if (EXPECT_DIGEST && seal.digest !== EXPECT_DIGEST) {
  console.error(`REFUSING TO START: expected digest ${EXPECT_DIGEST}, served build is ${seal.digest} (badge ${seal.badge}). A soak that cannot name its build measures a question nobody can state.`);
  process.exit(2);
}

// PASSPORT-3. The digest says WHAT the bytes are; the SHA says WHICH COMMIT made them. Without it a
// ten-hour artifact records a fingerprint nobody can trace back to a tree.
const buildInfo = await readBuildInfo(SEAL_ORIGIN);
if (REQUIRE_SHA || EXPECT_SHA) {
  if (!buildInfo.ok) {
    console.error(`REFUSING TO START: the source commit SHA is not readable from ${buildInfo.url} [${buildInfo.state}].`);
    console.error(`  ${buildInfo.why}`);
    console.error('  Recording sourceCommitSha:null for ten hours would produce an artifact that LOOKS provenanced and is not.');
    console.error('  Pass --requireSha=0 to measure an unprovenanced build deliberately.');
    process.exit(3);
  }
  if (EXPECT_SHA && buildInfo.sourceCommitSha !== EXPECT_SHA.toLowerCase()) {
    console.error(`REFUSING TO START: expected source commit ${EXPECT_SHA}, origin was built from ${buildInfo.sourceCommitSha}.`);
    process.exit(3);
  }
} else if (!buildInfo.ok) {
  log(`WARNING — source commit UNAVAILABLE [${buildInfo.state}]: ${buildInfo.why}`);
}
const pinnedSha = buildInfo.ok ? buildInfo.sourceCommitSha : null;

/**
 * SPEED-01 must be in the served bytes before the arm starts, and the engine files the seal does not
 * cover get their own pinned digest. Refused at boot rather than annotated, on the same reasoning as the
 * speed gate: an arm that runs to completion against a build without the fix produces a real-looking
 * artifact about the wrong build, and nothing downstream can tell.
 */
const capCheck = await checkSpeed01Served(SEAL_ORIGIN);
if (!capCheck.ok) {
  console.error(`REFUSING TO START: the served build does not carry SPEED-01 — ${capCheck.state}.`);
  if (capCheck.state === 'SPA_FALLBACK') console.error('  200 with HTML: the path does not exist and the origin returned the app shell, so a marker check means nothing.');
  if (capCheck.state === 'MISSING_MARKERS') console.error(`  Missing: ${capCheck.missing.join(', ')}`);
  process.exit(7);
}
const pinnedCapability = await capabilityDigest(SEAL_ORIGIN);
const pinnedCapabilityDigest = pinnedCapability.digest;

const run = openRun({
  name: `sealed-soak-${ARM}`,
  out: OUT,
  meta: {
    signature: 'SEALED-TWO-ARM-SOAK-V1',
    arm: ARM,
    armMeaning: ARM === 'zerotrade' ? 'CONF-05: four panels, E indicators, ZERO trades — bar-driven growth with the trade term absent by construction' : 'CONF-01: four panels, E indicators, governor holding ~20 closes/hour',
    bfcacheState: 'default (enabled) — a long-running session, no reset axis measured here.',
    seal,
    // PASSPORT-3: badge + digest describe the BYTES; sourceCommitSha names the TREE that produced them.
    sourceCommitSha: pinnedSha,
    sourceCommitState: buildInfo.state,
    sourceCommitWhy: buildInfo.why,
    sourceBuildId: buildInfo.ok ? buildInfo.buildId : null,
    checkpointBuild: buildInfo.ok ? buildInfo.checkpointBuild : null,
    // TOOL-01: recorded so the artifact states the cap it ran under, not just that one was intended.
    heapCap,
    origin: ORIGIN,
    sealOrigin: SEAL_ORIGIN,
    rehearsal: IS_REHEARSAL,
    publishable: !IS_REHEARSAL,
    rehearsalWhy: IS_REHEARSAL
      ? `THROWAWAY. The seal was read from ${SEAL_ORIGIN}, not from the origin the browser booted (${ORIGIN}), so the digest describes a mirror rather than the measured build. This artifact exercises launcher and refusal MECHANICS and carries no publishable measurement.`
      : null,
    requestedSpeed: SPEED,
    plannedHours: HOURS,
    // What the run asks of the data, recorded before it starts. Read alongside conf01.commonWindow
    // in the segment start note, which records what the data actually offered.
    requiredRunwayDays: REQUIRED_RUNWAY_MS != null
      ? Number((REQUIRED_RUNWAY_MS / 86_400_000).toFixed(2)) : null,
    detach01: 'append-as-taken JSONL with fsync, heartbeat per sample, auto-resume across a browser death with the resume recorded as a segment boundary',
  },
});
log(`opened, resumed ${run.resumedSamples.length} samples, ${run.tornLinesSkipped} torn line(s) skipped, badge ${seal.badge} digest ${seal.digest}`);

let segment = run.resumedSamples.length ? (Math.max(...run.resumedSamples.map((r) => r.segment || 1)) + 1) : 1;
if (run.resumedSamples.length) {
  run.note({
    __segmentBoundary: true,
    segment,
    why: 'Resumed after the previous browser ended. A new browser resets resident bars and footprint, so samples before and after this line belong to DIFFERENT populations and must not be pooled into one slope.',
  });
}

const t0 = Date.now();
let session = null;
const gaugeMisses = { footprint: 0, blocking: 0 };
let prevSample = null;
// RATE-HOLD state. Same reasoning as R3 below: a delivery ratio spanning a browser restart would compare
// a warmed session against a cold one, so the series is in-process and a resume starts it fresh.
let prevRateSample = null;
let prevPanels = null;   // per-panel delivery needs each panel's own previous playhead, not just the host's
const rateSeries = [];
let storageAtStart = null;
let r3ProbeDone = false;
let offlineProbeDone = false;
const rateExcludedWindows = [];
// R3 state. The series is rebuilt in-process rather than re-read from disk, so a resumed run starts its
// falsifier window fresh - a plateau test across a browser restart would be two populations.
const r3Series = [];
let lastR3Verdict = null;
let keepTheHourUntil = null;
let nextGovernorAt = Date.now();
const governorEveryMs = 3_600_000 / Math.max(1, CLOSES_PER_HOUR);

try {
  while ((Date.now() - t0) / 3600000 < HOURS) {
    if (!session) {
      // A new browser resets both resident bars and footprint, so the first sample of a new segment has no
      // valid predecessor. Carrying one across would compute a slope between two populations.
      prevSample = null;
      reapOrphanedRenderers();
      const eSel = loadConf05Indicators();
      log(`booting segment ${segment}`);
      // same-symbol: one file at 1m/5m/15m/1h so multi-TF sync has a common window.
      // distinct-four-files parked 3/4 panels at masterLen-1 for every prior CONF-01 measurement.
      session = await bootConf01Session({
        indicators: eSel.pairs,
        replaySpeed: SPEED,
        placeOrder: ARM !== 'zerotrade',
        label: `sealed-soak-${ARM}`,
        datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
        requireDeliveringPanels: 4,
        /**
         * CONF01-COMMON-WINDOW-V1. same-symbol already guarantees the four panels share a calendar
         * window, but sharing one is not the same as having enough of it: this arm consumes
         * HOURS x SPEED x 60 seconds of market time, and the gate now says out loud how many times
         * that laps the data instead of letting it surface as parked panels and re-seeks.
         *
         * Declared rather than required — refusing here would refuse every long arm on this
         * deployment, since no file holds the runway a ten-hour run at speed 10 needs.
         */
        requiredRunwayMs: REQUIRED_RUNWAY_MS,
        runwayPolicy: 'declare',
      });
      /**
       * What speed the engine believes it is running, read by several routes with the answering route
       * recorded. SPEED-01 introduced `getTargetBarsPerSecond()` and normalises there, so a reader that
       * knows only `rs.speed` can return the pre-migration field, or null, on the very build the ladder
       * changed under. A null here is not "no mismatch" - it is no verification at all.
       */
      const effRead = await session.page.evaluate(() => {
        const rs = window.chart && window.chart.replaySystem;
        if (!rs) return { value: null, route: null, why: 'no replaySystem' };
        const routes = [
          ['getTargetBarsPerSecond()', () => (typeof rs.getTargetBarsPerSecond === 'function' ? rs.getTargetBarsPerSecond() : undefined)],
          ['targetBarsPerSecond', () => rs.targetBarsPerSecond],
          ['speed', () => rs.speed],
          ['playbackSpeed', () => rs.playbackSpeed],
        ];
        const seen = [];
        for (const [name, get] of routes) {
          let v;
          try { v = get(); } catch (e) { seen.push({ route: name, error: String(e).slice(0, 60) }); continue; }
          if (v === undefined) { seen.push({ route: name, present: false }); continue; }
          seen.push({ route: name, present: true, value: Number.isFinite(Number(v)) ? Number(v) : String(v) });
        }
        const answered = seen.find((s) => s.present && typeof s.value === 'number');
        return { value: answered ? answered.value : null, route: answered ? answered.route : null, routes: seen };
      }).catch((e) => ({ value: null, route: null, why: String(e).slice(0, 100) }));
      const eff = effRead.value;
      const panels = await readPanels(session.page);
      // CDP injection, per segment because a new browser is a new set of documents. Registered for future
      // documents AND evaluated into the live ones - registration alone reaches nothing that already
      // exists, which on this soak is every frame that matters.
      const loafInstall = await installLoafCensus(session.page).catch((e) => ({ onNewDocument: false, liveFramesInjected: 0, error: String(e).slice(0, 150) }));
      // N4, reading one of three. Taken at the first segment only: a resumed segment's "start" is a warm
      // origin, and calling that arm start would understate growth by everything the first segment wrote.
      if (!storageAtStart) {
        storageAtStart = await readStorageCensus(session.page).catch((e) => ({ error: String(e).slice(0, 150) }));
        run.note({ __storageCensus: true, when: 'arm-start', segment, ...storageAtStart });
      }
      run.note({
        __segmentStart: true,
        segment,
        requestedSpeed: SPEED,
        effectiveSpeed: eff,
        effectiveSpeedRoute: effRead.route,
        effectiveSpeedRoutes: effRead.routes ?? null,
        /**
         * CONF01-COMMON-WINDOW-V1 as graded on THIS segment's live panels. Per segment rather than
         * per run because a resumed segment re-seeds and may land on a different window, and a
         * slope pooled across two different windows is two populations again.
         */
        commonWindow: session.conf01?.commonWindow ?? null,
        // Read off the LIVE object, because served bytes and executed bytes differ when a service worker
        // sits between them. Recorded at segment start rather than every sample: it cannot change without
        // a reload, and the capability digest below covers the bytes changing underneath a running arm.
        speed01Runtime: await readSpeed01Runtime(session.page.mainFrame()).catch(() => null),
        loafInstall: { ...loafInstall, viaProductBytes: false, how: 'Page.addScriptToEvaluateOnNewDocument plus live-frame evaluate. The served bytes are untouched and the digest is unchanged.' },
        panels: panels.length,
        timeframes: panels.map((p) => p.tf),
      });
      if (panels.length < 4) {
        run.note({ __void: true, segment, why: `Only ${panels.length} chart frames at boot; CONF-01 requires 4.` });
        throw new Error('panel gate failed at boot');
      }
      /**
       * The speed gate, now a refusal rather than a note.
       *
       * Both branches stop the run, and they are separated because they mean different things. A
       * MISMATCH means the engine is running a speed I did not ask for, so every rate in the arm
       * belongs to a condition I did not choose. An UNREADABLE speed means I cannot tell either way,
       * which on a ten-hour arm is not better - it is the same artifact with the evidence removed.
       */
      if (eff != null && Number(eff) !== SPEED) {
        const why = `Requested ${SPEED} bars/s, engine reports ${eff} (via ${effRead.route}). Every rate in this arm would belong to ${eff}, not ${SPEED}.`;
        run.note({ __void: true, segment, why, requestedSpeed: SPEED, effectiveSpeed: eff, effectiveSpeedRoutes: effRead.routes ?? null });
        log(`REFUSING: ${why}`);
        throw new Error(`speed gate failed: requested ${SPEED}, engine reports ${eff}`);
      }
      if (eff == null) {
        const why = `Could not read the engine's speed by any known route, so the SPEED-01 envelope is unverified. Routes tried: ${JSON.stringify(effRead.routes ?? effRead.why ?? null)}`;
        run.note({ __void: true, segment, why, requestedSpeed: SPEED, effectiveSpeed: null, effectiveSpeedRoutes: effRead.routes ?? null });
        log(`REFUSING: ${why}`);
        throw new Error('speed gate failed: engine speed unreadable');
      }
      log(`segment ${segment} up: ${panels.length} panels, effective speed ${eff}`);
    }

    await sleep(SAMPLE_MS);

    let before = null;
    let after = null;
    let blocking = {};
    let frameRate = {};
    let footprint = {};
    let arenas = {};
    try {
      before = await readPanels(session.page);
      // The liveness window already costs 20 s of wall clock. Blocking is observed ACROSS it rather than
      // after it, so the lag series is free and lands at exactly the same cadence as the memory series.
    blocking = await measureBlocking(session.page.mainFrame(), 20000);
    frameRate = await measureFrameRate(session.page.mainFrame(), 3000);
    after = await readPanels(session.page);
      footprint = await readFootprint(session.browser);
      // ARENA-COLUMNS (item 1): per-arena columns on the same 3-min cadence as the memory series, in
      // this row format. A dump failure degrades to null columns rather than dropping the sample.
      arenas = await readArenaColumns(session.browser, footprint.footprintTotalMB);
    } catch (err) {
      log(`sample read failed (${String(err).slice(0, 80)}) — treating as a dead browser and resuming`);
    }

    if (!before || !after || !after.length) {
      run.note({ __browserLost: true, segment, at: new Date().toISOString(), why: 'Browser stopped answering. Auto-resuming into a new segment.' });
      try { await session.browser.close(); } catch { /* already gone */ }
      session = null;
      segment += 1;
      continue;
    }

    // Playhead liveness, with the bar-count route recorded beside it rather than instead of it.
    const live = after.filter((r, i) => (r.playhead != null && before[i]?.playhead != null && r.playhead !== before[i].playhead) || r.bars > (before[i]?.bars ?? 0)).length;
    const liveByBars = after.filter((r, i) => r.bars > (before[i]?.bars ?? 0)).length;

    const closed = await readClosed(session.page);
    if (ARM !== 'zerotrade' && Date.now() >= nextGovernorAt) {
      await cycleTrades(session.page, { open: 1, close: 1, holdMs: 800 }).catch(() => null);
      nextGovernorAt = Date.now() + governorEveryMs;
    }

    const nowSeal = await passport();
    const sealHeld = nowSeal.digest === seal.digest;
    // PASSPORT-3 re-verified at the SAME cadence as the digest. The digest catches different bytes; the
    // SHA catches a different source. Neither implies the other, so both, every sample.
    const nowInfo = await readBuildInfo(SEAL_ORIGIN);
    const shaDrift = shaChanged(pinnedSha, nowInfo);
    /**
     * THE THIRD IDENTITY, and it closes a hole in my own seal.
     *
     * SEAL_PATHS covers six files and not one of them is replay-system.js, order-manager.js or
     * chart-indicators-full.js - the three files carrying most of the roster. So the digest I have been
     * re-verifying every sample for weeks would not have noticed the replay engine itself being replaced
     * mid-run. Kept separate from the seal digest rather than folded into it, because that digest has to
     * keep agreeing with build-passport and two tools disagreeing about one build has cost us once.
     */
    const nowCap = await capabilityDigest(SEAL_ORIGIN).catch(() => ({ digest: null, ok: false }));
    const capabilityHeld = nowCap.digest != null && nowCap.digest === pinnedCapabilityDigest;

    // MANIFEST ADDITIONS, all harness-side. None of these touch the served bytes, so the digest above is
    // the digest of the build a user gets. An instrument that changed it would defeat SOAK-SEAL through
    // the instrument instead of the code.
    const host = readHostHealth();                                    // system headroom + node.exe aggregate
    const loaf = await readLoafCensus(session.page).catch(() => ({ ok: false, why: 'census read threw' }));
    const posn = await readOldestOpenPositionAge(session.page).catch(() => ({ route: 'threw', openCount: null, oldestAgeBars: null }));

    const residentBars = after.reduce((s, r) => s + r.bars, 0);

    // RATE-HOLD, the headline verdict. Delivery is measured on the HOST panel's continuous clock, because
    // the host carries 86% of resident bars and a per-panel governor can hold one panel while starving
    // three. The read-back rides along as a witness and is never the judge - see lib/rate-hold.mjs.
    const hostPanel = after.find((r) => r.isHost) || after[0] || {};
    const rateSample = { atMs: Date.now(), replayTimestamp: hostPanel.playheadMs, replayIndex: hostPanel.replayIndex };
    const hostTfSec = tfSeconds(hostPanel.tf);
    const rate = (prevRateSample && hostTfSec)
      ? deliveredRate(prevRateSample, rateSample, { baseTimeframeSec: hostTfSec })
      : { ok: false, why: prevRateSample ? `host panel timeframe unreadable (${hostPanel.tf}) — bars/s has no denominator` : 'first sample' };
    prevRateSample = rateSample;
    /**
     * The live-panel count is computed ~40 lines below this push, so until now the RATE-HOLD series
     * carried NO panel information and its baseline could open on samples reading livePanels=0. The
     * entry is held here and the count is attached once measured, rather than moving the rate
     * computation, which would change what the primary gauge measures to fix a bookkeeping order.
     */
    const rateEntry = rate.ok
      ? { hours: +((Date.now() - t0) / 3600000).toFixed(4), marketSecPerWallSec: rate.marketSecPerWallSec, barsPerSec: rate.barsPerSec, barsPerSecDenominatorSec: rate.barsPerSecDenominatorSec, speed: SPEED, livePanels: null }
      : null;
    if (rateEntry) rateSeries.push(rateEntry);
    const rateReadback = await readEffectiveRateReadback(session.page).catch(() => ({ present: false, readError: true }));

    /**
     * PER-PANEL DELIVERY, because the host-anchored rate above has a blind spot I would otherwise have
     * carried into the ten hours.
     *
     * The comment on the host anchor says a per-panel governor "can hold one panel while starving three"
     * - and then measures only the panel that would still be running. E measured the frame governor's
     * effect on delivery and found no cost, with three of four panels reading 0 bars/s; a one-panel
     * oracle cannot tell that condition apart from a healthy four-panel one. So each panel's own advance
     * is recorded and the live count travels with every sample.
     *
     * Read by PLAYHEAD, not bar count. A 1h panel closes a bar every few minutes of simulated time, so
     * bar-count advance reports higher timeframes as parked over a short window - a false void my own
     * probes have hit twice, once reading 1 of 4 panels when the playhead said 4 of 4. If a reading of
     * "three panels parked" is ever produced here, that is the first thing to rule out.
     */
    const panelRates = after.map((p) => {
      const prevP = (prevPanels || []).find((q) => q.id === p.id);
      const tfSec = tfSeconds(p.tf);
      if (!prevP || !tfSec) return { id: p.id, tf: p.tf, marketSecPerWallSec: null, barsPerSec: null, why: prevP ? 'timeframe unreadable' : 'first sample' };
      const r = deliveredRate(
        { atMs: prevP.atMs, replayTimestamp: prevP.playheadMs, replayIndex: prevP.replayIndex },
        { atMs: Date.now(), replayTimestamp: p.playheadMs, replayIndex: p.replayIndex },
        { baseTimeframeSec: tfSec },
      );
      return {
        id: p.id, tf: p.tf,
        // PRIMARY unit. Live-panel detection reads THIS, never bars/s: a 1h panel delivering market
        // time can sit between bars for minutes and would look parked on a bars/s > 0 test.
        marketSecPerWallSec: r.ok ? r.marketSecPerWallSec : null,
        barsPerSec: r.ok ? r.barsPerSec : null,
        barsPerSecDenominatorSec: tfSec,
        why: r.ok ? null : r.why,
      };
    });
    prevPanels = after.map((p) => ({ id: p.id, playheadMs: p.playheadMs, replayIndex: p.replayIndex, atMs: Date.now() }));
    const livePanels = panelRates.filter((p) => Number.isFinite(p.marketSecPerWallSec) && p.marketSecPerWallSec > 0).length;
    const measurablePanels = panelRates.filter((p) => Number.isFinite(p.marketSecPerWallSec)).length;
    // Attaches to the entry pushed above, so RATE-HOLD can refuse to anchor its reference window on
    // samples taken before the panels were up.
    if (rateEntry) rateEntry.livePanels = livePanels;

    run.append({
      segment,
      hours: +((Date.now() - t0) / 3600000).toFixed(4),
      residentBars,
      // RATE-HOLD inputs, per sample.
      // RATE-HOLD primary unit: market-seconds delivered per wall-second. bars/s is derived display.
      marketSecPerWallSec: rate.ok ? rate.marketSecPerWallSec : null,
      deliveredBarsPerSec: rate.ok ? rate.barsPerSec : null,
      barsPerSecDenominatorSec: rate.ok ? rate.barsPerSecDenominatorSec : hostTfSec,
      deliveredRateRoute: rate.ok ? rate.route : null,
      deliveredRateTimeframe: hostPanel.tf ?? null,
      deliveredRateTimeframeSec: hostTfSec,
      deliveredRateWhy: rate.ok ? null : rate.why,
      effectiveRateReadback: rateReadback.present ? rateReadback.values?.[0]?.barsPerSec ?? null : null,
      effectiveRateReadbackPresent: rateReadback.present,
      perPanelBars: after.map((r) => r.bars),
      panelsLive: live,
      panelsLiveByBarCountOnly: liveByBars,
      closedTrades: closed,
      // MEMORY — the reason this run exists.
      ...footprint,
      // ARENA-COLUMNS + TOTAL-01 + the COV-01 remainder, flat beside footprintTotalMB.
      ...arenas,
      ...perBarFields(footprint.footprintTotalMB, residentBars, prevSample),
      localSlopeNote: 'localSlopeMbPerKbar is the consecutive-sample slope and is the figure comparable to the published 23.98 / 24.55 / 25.35 MB/kbar. footprintPerKbarLEVEL is NOT - it carries the fixed baseline and falls as bars accumulate. The run-level slope comes from a fit over all samples, not from either field.',
      // LAG — same host, same cadence, so the scorecard has a before/after that is not two computers.
      ...blocking,
      ...frameRate,
      // Four live panels is the CONDITION this arm claims to measure, so it is recorded per sample
      // rather than asserted once at boot. A verdict computed over samples where three panels were
      // parked is a verdict about a different workload.
      panelRates,
      livePanels,
      measurablePanels,
      allFourLive: measurablePanels > 0 ? livePanels >= 4 : null,
      // FRAME-01 coupling, stated per sample rather than reconstructed afterwards. If bar advance is
      // tied to paint this ratio pins near a constant; if delivery is independent of the frame cap it
      // wanders. Recorded raw so the question is answerable either way from the artifact alone.
      marketSecPerFrame: (rate.ok && Number(frameRate.hostFramesPerSec) > 0 && Number.isFinite(rate.marketSecPerWallSec))
        ? +(rate.marketSecPerWallSec / frameRate.hostFramesPerSec).toFixed(4) : null,
      barsPerFrame: (rate.ok && Number(frameRate.hostFramesPerSec) > 0 && Number.isFinite(rate.barsPerSec))
        ? +(rate.barsPerSec / frameRate.hostFramesPerSec).toFixed(4) : null,
      // HOST HEALTH joined per sample: the crash that cost ten hours was 16,387 MB of node.exe at 99%
      // system memory, reconstructed afterwards because no sample carried the host beside the browser.
      host,
      // LoAF per-script attribution, CDP-injected. This is the ~724 ms/s naming census, collected free all
      // night rather than in a five-second trace that caught a quiet stretch.
      loaf,
      // R3 inputs. Age is read EVERY sample because the falsifier must not have to infer it later.
      openPositions: posn.openCount,
      oldestOpenPositionAgeBars: posn.oldestAgeBars,
      openPositionRoute: posn.route,
      evictionActive: EVICTION_ACTIVE,
      sealDigestNow: nowSeal.digest,
      sealHeld,
      sourceCommitNow: nowInfo.ok ? nowInfo.sourceCommitSha : null,
      sourceCommitStateNow: nowInfo.state,
      sourceCommitHeld: pinnedSha ? shaDrift === null : null,
      sourceCommitNote: shaDrift,
      sealNote: sealHeld ? null : 'BUILD CHANGED UNDER THE RUN. Every sample from here belongs to a different build and must not be pooled with earlier ones.',
      capabilityDigestNow: nowCap.digest,
      capabilityHeld,
      capabilityNote: capabilityHeld ? null : 'THE ENGINE FILES MOVED and the seal digest cannot see them — replay-system.js, order-manager.js or chart-indicators-full.js changed under the run.',
    });

    // Treated exactly like a seal break, because that is what it is: the seal simply never covered these
    // files. A mid-run change to the replay engine would otherwise have been completely silent.
    if (!capabilityHeld) {
      run.note({ __void: true, segment, why: `Engine files changed mid-run: capability digest ${pinnedCapabilityDigest} -> ${nowCap.digest}. These are NOT in SEAL_PATHS, so the seal held while the replay engine was replaced.` });
      log('CAPABILITY DIGEST BROKEN — stopping');
      break;
    }
    if (!sealHeld) {
      run.note({ __void: true, segment, why: `Served build changed mid-run: ${seal.digest} -> ${nowSeal.digest}. Stopping rather than producing a series across two builds.` });
      log('SEAL BROKEN — stopping');
      break;
    }
    if (shaDrift) {
      run.note({ __void: true, segment, why: `${shaDrift} Stopping rather than producing a series across two sources.` });
      log('SOURCE COMMIT DRIFT — stopping');
      break;
    }
    // Carried forward for the next sample's local slope. Reset at a segment boundary by the boot path,
    // because a new browser resets both quantities and a slope across that boundary is two populations.
    if (footprint.footprintTotalMB != null) prevSample = { bars: residentBars, mb: footprint.footprintTotalMB };

    if (live < 4) {
      run.note({ __warning: true, segment, why: `Only ${live} of ${after.length} panels live by playhead (bar-count route says ${liveByBars}).` });
    }

    // R3. Evaluated in the loop so a refuted model costs two hours instead of ten, and never evaluated
    // without the open-position age beside it - MEM-1a pins bars behind an open position BY DESIGN, so
    // "no plateau" with an old position open is the scenario, not the model.
    r3Series.push({ hours: +((Date.now() - t0) / 3600000).toFixed(4), residentBars, footprintTotalMB: footprint.footprintTotalMB, oldestOpenPositionAgeBars: posn.oldestAgeBars, evictionActive: EVICTION_ACTIVE });
    const r3 = evaluateR3(r3Series);
    if (r3.verdict !== lastR3Verdict) {
      run.note({ __r3: true, segment, at: new Date().toISOString(), ...r3 });
      lastR3Verdict = r3.verdict;
    }

    // N3, inside the smoke: a 30-second outage mid-replay, watching the recovery as closely as the
    // outage. Runs once, and not on a ten-hour arm - deliberately disturbing the network of a run whose
    // verdict is delivery rate would put a hole in the series the verdict is computed from.
    if (OFFLINE_PROBE && !offlineProbeDone && session?.page && rateSeries.length >= 2) {
      offlineProbeDone = true;
      log('N3: 30 s offline toggle mid-replay');
      const off = await offlineToggle(session.page, { log }).catch((e) => ({ verdict: 'VOID', why: `probe threw: ${String(e).slice(0, 160)}` }));
      run.note({ __offlineToggle: true, segment, at: new Date().toISOString(), ...off });
      rateExcludedWindows.push({ fromMs: Date.now() - 75000, toMs: Date.now(), why: 'N3 offline toggle' });
      prevRateSample = null;
      log(`N3: ${off.verdict} — ${String(off.why).slice(0, 130)}`);
    }

    // PAUSE-PROBE at the R3 checkpoint. Once per arm: it costs ~11 minutes of delivery, and the window is
    // recorded so RATE-HOLD can exclude it rather than read a deliberate pause as a stall.
    if (!r3ProbeDone && r3.verdict && r3.verdict !== 'INSUFFICIENT' && session?.page) {
      r3ProbeDone = true;
      log('forced-GC pause-probe at the R3 checkpoint — separating froth from hoard');
      const probe = await forcedGcPauseProbe(session.page, {
        readFootprint: () => readFootprint(session.browser),
        readArenas: () => readArenaColumns(session.browser),
        label: `r3-checkpoint-${ARM}`,
        log,
      }).catch((e) => ({ verdict: 'VOID', why: `probe threw: ${String(e).slice(0, 160)}` }));
      run.note({ __pauseProbe: true, segment, at: new Date().toISOString(), ...probe });
      // The probe's own span is not a delivery measurement.
      rateExcludedWindows.push({ fromMs: Date.now() - (probe.probeSpanSec ?? 0) * 1000, toMs: Date.now(), why: 'pause-probe' });
      prevRateSample = null;
      log(`pause-probe: ${probe.verdict} — ${String(probe.why).slice(0, 120)}`);
    }
    if (r3.verdict === 'MODEL_VOID' && !keepTheHourUntil) {
      // ABORT THE NIGHT, KEEP THE HOUR.
      keepTheHourUntil = t0 + r3.keepHoursTarget * 3600000;
      run.note({
        __r3Abort: true, segment, at: new Date().toISOString(),
        why: `${r3.why} ${r3.action}`,
        stoppingAtHours: r3.keepHoursTarget,
      });
      log(`R3 MODEL_VOID — aborting the night, running to ${r3.keepHoursTarget} h to keep the curve`);
    }
    if (keepTheHourUntil && Date.now() >= keepTheHourUntil) {
      run.note({ __final: false, __r3Stop: true, segment, why: `R3 refuted the model; ran on to ${r3.keepHoursTarget} h to capture the true curve, then stopped as ruled.` });
      log('R3 keep-the-hour target reached — stopping');
      break;
    }

    const gauge = evaluateGauges(gaugeMisses, footprint, blocking);
    gaugeMisses.footprint = gauge.misses.footprint;
    gaugeMisses.blocking = gauge.misses.blocking;
    if (gauge.stop) {
      run.note({ __void: true, segment, why: gauge.why });
      log('GAUGE FAILURE — stopping');
      break;
    }
  }

  // END-OF-ARM SNAPSHOT. After the final sample, so it perturbs nothing it measured. A ~1.5 GB renderer
  // can write multiple GB and can OOM its own tab; disk is checked first, the write is capped, and every
  // END-OF-ARM PAUSE-PROBE, before the snapshot: the snapshot is a stop-the-world event and would drain
  // the very froth the probe exists to measure. Order matters and is deliberate.
  if (session?.page) {
    log('end-of-arm forced-GC pause-probe');
    const endProbe = await forcedGcPauseProbe(session.page, {
      readFootprint: () => readFootprint(session.browser),
      readArenas: () => readArenaColumns(session.browser),
      label: `end-of-arm-${ARM}`,
      log,
    }).catch((e) => ({ verdict: 'VOID', why: `probe threw: ${String(e).slice(0, 160)}` }));
    run.note({ __pauseProbe: true, when: 'end-of-arm', at: new Date().toISOString(), ...endProbe });
    log(`end-of-arm pause-probe: ${endProbe.verdict} — hoard floor ${endProbe.hoardFloorMB ?? '?'} MB`);

    // N4, readings two and three. The post-refresh read is the one that matters: it separates what the
    // session accumulated from what the ORIGIN keeps, which no process-memory gauge can see.
    const storageAtEnd = await readStorageCensus(session.page).catch((e) => ({ error: String(e).slice(0, 150) }));
    run.note({ __storageCensus: true, when: 'arm-end', ...storageAtEnd });
    let storageAfterRefresh = null;
    try {
      await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
      await new Promise((r) => setTimeout(r, 45000));
      storageAfterRefresh = await readStorageCensus(session.page);
      run.note({ __storageCensus: true, when: 'post-refresh', ...storageAfterRefresh });

      // THE PO RECIPE'S CLOSING ASSERTION: after a refresh, all four panels PAINT. Bars in an array are
      // not paint - my own reentry-no-chart defect produced 0 realms and 0 bars after a fresh navigation,
      // and a panel can hold data and render nothing. So the canvas is sampled for non-uniformity: a
      // blank canvas is one colour, a painted chart is not.
      const paint = await Promise.all(session.page.frames().map(async (fr) => {
        try {
          return await fr.evaluate(() => {
            if (!window.chart) return null;
            const cvs = [...document.querySelectorAll('canvas')].filter((c) => c.width > 50 && c.height > 50);
            let painted = false; let sampled = 0; let distinct = 0;
            for (const c of cvs) {
              try {
                const ctx = c.getContext('2d');
                if (!ctx) continue;
                const d = ctx.getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200)).data;
                const seen = new Set();
                for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
                sampled += 1;
                distinct = Math.max(distinct, seen.size);
                if (seen.size > 3) { painted = true; break; }
              } catch (_) { /* tainted or zero-size canvas */ }
            }
            return { isHost: window.top === window, bars: Array.isArray(window.chart.data) ? window.chart.data.length : 0, canvases: cvs.length, sampled, distinctColours: distinct, painted };
          });
        } catch { return null; }
      }));
      const painted = paint.filter((p) => p && p.painted);
      const withChart = paint.filter(Boolean);
      run.note({
        __postRefreshPaint: true,
        chartsAfterRefresh: withChart.length,
        panelsPainted: painted.length,
        perPanel: withChart,
        verdict: painted.length >= 4 ? 'ALL FOUR PANELS PAINT AFTER REFRESH' : `ONLY ${painted.length} OF ${withChart.length} PANELS PAINT AFTER REFRESH`,
        method: 'canvas pixel sampling for non-uniformity; a blank canvas is one colour. Bars present in an array is NOT paint.',
      });
      log(`post-refresh paint: ${painted.length}/${withChart.length} panels painted`);
    } catch (err) {
      run.note({ __storageCensus: true, when: 'post-refresh', failed: true, why: String(err).slice(0, 160) });
    }
    run.note({
      __storageDiff: true,
      startToEnd: diffStorage(storageAtStart, storageAtEnd, { labelA: 'arm-start', labelB: 'arm-end' }),
      endToPostRefresh: storageAfterRefresh ? diffStorage(storageAtEnd, storageAfterRefresh, { labelA: 'arm-end', labelB: 'post-refresh' }) : null,
      startToPostRefresh: storageAfterRefresh ? diffStorage(storageAtStart, storageAfterRefresh, { labelA: 'arm-start', labelB: 'post-refresh' }) : null,
      readingNote: 'Storage surviving a refresh is retention the user carries BETWEEN sessions. Process-memory gauges cannot see it, so this is a different quantity from every MB figure published so far and must not be added to them.',
    });
  }

  // RATE-HOLD verdict, computed at the end over the whole arm.
  {
    const verdict = evaluateRateHold(rateSeries);
    run.note({
      __rateHold: true, at: new Date().toISOString(), arm: ARM, ...verdict,
      samplesUsed: rateSeries.length,
      excludedWindows: rateExcludedWindows,
      judgedOn: 'MEASURED delivery (host panel simulated clock over wall time). A read-back, if present, is recorded per sample as a witness and is never the judge.',
    });
    log(`RATE-HOLD: ${verdict.verdict} — ${String(verdict.why).slice(0, 140)}`);
  }

  // failure is a logged non-event. A lost snapshot must never look like a lost soak.
  if (SNAPSHOT_AT_END && session?.page) {
    const snapFile = OUT.replace(/\.jsonl$/, `.heapsnapshot`);
    log('taking end-of-arm heap snapshot (by-product; failure is a non-event)');
    const snap = await takeEndOfArmSnapshot(session.page, { outFile: snapFile, capMB: SNAPSHOT_CAP_MB })
      .catch((e) => ({ attempted: true, ok: false, failedWhy: String(e).slice(0, 200) }));
    run.note({ __endOfArmSnapshot: true, at: new Date().toISOString(), ...snap });
    log(`snapshot ${snap.ok ? `written ${snap.mb} MB` : `not taken: ${snap.skippedWhy || snap.failedWhy}`}`);
  }

  run.finish({ completed: true, segments: segment });
} catch (err) {
  run.note({ __error: true, error: String(err && err.stack ? err.stack : err).slice(0, 600) });
  run.finish({ completed: false, segments: segment });
} finally {
  try { if (session?.browser) await session.browser.close(); } catch { /* gone */ }
}
log(`done: ${JSON.stringify(inspectRun(OUT))}`);
