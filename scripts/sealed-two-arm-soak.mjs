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
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { reapOrphanedRenderers } from './lib/find-soak-port.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { perBarFields, evaluateGauges } from './lib/soak-gauges.mjs';
import { readBuildInfo, shaChanged } from './lib/build-info.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readHostHealth } from './lib/host-health.mjs';
import { installLoafCensus, readLoafCensus } from './lib/loaf-census.mjs';
import { evaluateR3, readOldestOpenPositionAge } from './lib/r3-falsifier.mjs';
import { takeEndOfArmSnapshot } from './lib/end-of-arm-snapshot.mjs';
import { assertHeapCap } from './lib/heap-cap.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM = argOf('arm', 'trades');                 // trades | zerotrade
const HOURS = Number(argOf('hours', '10'));
const SAMPLE_MS = Number(argOf('sampleMs', '180000'));
const SPEED = Number(argOf('speed', '60'));
const CLOSES_PER_HOUR = Number(argOf('closesPerHour', '20'));
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

// TOOL-01, asserted before anything expensive is opened. A cap that was requested but never applied is
// worse than no cap, because the launch line in the log looks correct.
const heapCap = assertHeapCap({ capMB: HEAP_CAP_MB, label: `sealed-soak-${ARM}` });

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
  async function readFootprint(browser) {
    try {
      const cdp = await browser.target().createCDPSession();
      const info = await cdp.send('SystemInfo.getProcessInfo');
      await cdp.detach().catch(() => {});
      const procs = info.processInfo || [];
      const fps = await readOsFootprints(procs.map((p) => p.id));
      let total = 0;
      let pageRenderer = 0;
      let rendererCount = 0;
      const byType = {};
      for (const p of procs) {
        const fp = fps[p.id];
        if (!fp) continue;
        total += fp.privateMB;
        const key = /renderer/i.test(p.type) ? 'renderer' : (/gpu/i.test(p.type) ? 'gpu' : (/browser/i.test(p.type) ? 'browser' : 'other'));
        byType[key] = +((byType[key] || 0) + fp.privateMB).toFixed(1);
        if (/renderer/i.test(p.type)) {
          rendererCount += 1;
          if (fp.privateMB > pageRenderer) pageRenderer = fp.privateMB;
        }
      }
      // A footprint of zero is what this platform returns when the read fails, and zero is a number that
      // would fit a slope quite happily. Null it instead.
      if (!(total > 0)) return { footprintTotalMB: null, footprintReadFailed: true };
      return {
        footprintTotalMB: +total.toFixed(1),
        footprintByType: byType,
        pageRendererMB: +pageRenderer.toFixed(1),
        rendererProcesses: rendererCount,
        processesSeen: procs.length,
      };
    } catch (err) {
      return { footprintTotalMB: null, footprintReadFailed: String(err && err.message).slice(0, 90) };
    }
  }

  /**
   * Blocking ms/s on the same definition as the trace calibration and the twelve-minute frequency run:
   * sum of (duration - 50) over main-thread tasks longer than 50 ms, divided by observed seconds.
   *
   * Installed and DISCONNECTED per sample. Over ten hours a persistent observer would accumulate entries
   * inside the very process whose memory slope is the measurement - the instrument would become the leak.
   */
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
      session = await bootConf01Session({
        indicators: eSel.pairs,
        replaySpeed: SPEED,
        placeOrder: ARM !== 'zerotrade',
        label: `sealed-soak-${ARM}`,
      });
      const eff = await session.page.evaluate(() => {
        const rs = window.chart && window.chart.replaySystem;
        return rs ? (rs.speed ?? rs.playbackSpeed ?? null) : null;
      }).catch(() => null);
      const panels = await readPanels(session.page);
      // CDP injection, per segment because a new browser is a new set of documents. Registered for future
      // documents AND evaluated into the live ones - registration alone reaches nothing that already
      // exists, which on this soak is every frame that matters.
      const loafInstall = await installLoafCensus(session.page).catch((e) => ({ onNewDocument: false, liveFramesInjected: 0, error: String(e).slice(0, 150) }));
      run.note({
        __segmentStart: true,
        segment,
        requestedSpeed: SPEED,
        effectiveSpeed: eff,
        loafInstall: { ...loafInstall, viaProductBytes: false, how: 'Page.addScriptToEvaluateOnNewDocument plus live-frame evaluate. The served bytes are untouched and the digest is unchanged.' },
        speedMismatch: eff != null && Number(eff) !== SPEED ? `Requested ${SPEED}, engine reports ${eff}. Every rate in this segment belongs to ${eff}.` : null,
        panels: panels.length,
        timeframes: panels.map((p) => p.tf),
      });
      if (panels.length < 4) {
        run.note({ __void: true, segment, why: `Only ${panels.length} chart frames at boot; CONF-01 requires 4.` });
        throw new Error('panel gate failed at boot');
      }
      log(`segment ${segment} up: ${panels.length} panels, effective speed ${eff}`);
    }

    await sleep(SAMPLE_MS);

    let before = null;
    let after = null;
    let blocking = {};
    let footprint = {};
    try {
      before = await readPanels(session.page);
      // The liveness window already costs 20 s of wall clock. Blocking is observed ACROSS it rather than
      // after it, so the lag series is free and lands at exactly the same cadence as the memory series.
      blocking = await measureBlocking(session.page.mainFrame(), 20000);
      after = await readPanels(session.page);
      footprint = await readFootprint(session.browser);
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

    // MANIFEST ADDITIONS, all harness-side. None of these touch the served bytes, so the digest above is
    // the digest of the build a user gets. An instrument that changed it would defeat SOAK-SEAL through
    // the instrument instead of the code.
    const host = readHostHealth();                                    // system headroom + node.exe aggregate
    const loaf = await readLoafCensus(session.page).catch(() => ({ ok: false, why: 'census read threw' }));
    const posn = await readOldestOpenPositionAge(session.page).catch(() => ({ route: 'threw', openCount: null, oldestAgeBars: null }));

    const residentBars = after.reduce((s, r) => s + r.bars, 0);
    run.append({
      segment,
      hours: +((Date.now() - t0) / 3600000).toFixed(4),
      residentBars,
      perPanelBars: after.map((r) => r.bars),
      panelsLive: live,
      panelsLiveByBarCountOnly: liveByBars,
      closedTrades: closed,
      // MEMORY — the reason this run exists.
      ...footprint,
      ...perBarFields(footprint.footprintTotalMB, residentBars, prevSample),
      localSlopeNote: 'localSlopeMbPerKbar is the consecutive-sample slope and is the figure comparable to the published 23.98 / 24.55 / 25.35 MB/kbar. footprintPerKbarLEVEL is NOT - it carries the fixed baseline and falls as bars accumulate. The run-level slope comes from a fit over all samples, not from either field.',
      // LAG — same host, same cadence, so the scorecard has a before/after that is not two computers.
      ...blocking,
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
    });

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
