/**
 * BOOT-ENDPOINT-READING-01 — the canonical settled floor, taken at the soak's hour-0 endpoint.
 *
 * WHY THIS EXISTS AT ALL. The floor re-take was scheduled as its own exclusive host window (W2). It
 * no longer is: the PO's completeness clause pre-declares the fallback, so the soak's hour-0 endpoint
 * becomes the canonical settled reading and the floor rides the arm it was going to precede. That is
 * strictly better than a separate window — the floor and the arm it grades are now the same browser,
 * same build, same box, same minute, so no cross-run identity argument is needed to compare them.
 *
 * WHY THE EXISTING HOUR-0 CAPTURE WAS NOT ALREADY THIS. The soak already took a detailed dump at
 * `<arm>:start`, and it is not a settled reading and never was. It is taken on the first sample with
 * panels up — a PLAYING page, one read, no curve. Against SETTLE-CRITERION-V2 that fails Q (playback
 * running, so it samples the phase of a sawtooth) and fails F (one point is not a curve). Promoting it
 * to canonical without changing it would have re-published exactly the defect that retired the five
 * historical readings. So the endpoint grows a real settle curve: pause, then three reads at 600 s
 * rungs with a forced collection at each, then resume the arm.
 *
 * COST: ~21 minutes at the head of each arm, once. The frozen recipe was amended for it.
 *
 * The validity checklist (READING-VALIDITY-01) runs INLINE here rather than in a later report, because
 * a checklist that runs later is a checklist someone can quote the number ahead of.
 */

import fs from 'node:fs';
import path from 'node:path';
import { quiesce, resumePlay, forceCollection } from './settle-protocol.mjs';
import { assessSettled, RUNG_MIN_MS } from './settle-criterion.mjs';
import { assessAgainstBar } from './bar-basis.mjs';
import { assessReading, failureSidecar } from './reading-validity.mjs';

/** Three reads at 600 s: the minimum ladder that can satisfy condition F. Two would not be a curve. */
export const DEFAULT_RUNGS_MS = [0, RUNG_MIN_MS, RUNG_MIN_MS];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * CAPABILITY-PROBE-01 — proof that THIS reading path can see a change of the size we care about.
 *
 * The obvious capability proof was already on disk: E's `combined-canvas-fix-settle-20260802.json`,
 * which re-detected a 50.78 MB reclaim under forced GC. It is not usable here, and the reason matters.
 * That artifact proves **E's harness** can see a change; it says nothing about whether this soak's
 * `readFootprint` path can. Quoting it in this checklist would be BASIS-GUARD-01's error wearing a
 * different costume — a figure measured on one instrument used to certify another.
 *
 * So the endpoint proves itself, in situ: commit a known number of megabytes in the renderer, read,
 * release, collect, read again. An instrument that cannot see 64 MB appear and leave cannot be trusted
 * to have seen the floor it just reported.
 *
 * ORDERING. This runs AFTER the curve and the dump, so the quoted floor is measured before any of the
 * probe's bytes exist. A capability proof that moved the number it certifies would be worthless.
 */
export async function capabilityProbe(page, { mb = 64, readFootprint, log = () => {}, gcOptions } = {}) {
  const baseline = (await readFootprint().catch(() => ({})))?.footprintTotalMB ?? null;

  // Filled, not merely allocated: an untouched ArrayBuffer can be reserved without being resident, and
  // a probe the OS never commits would report the instrument blind when it is the probe that is empty.
  const allocated = await page.evaluate((n) => {
    try {
      const buf = new Uint8Array(n * 1024 * 1024);
      for (let i = 0; i < buf.length; i += 4096) buf[i] = 1;
      window.__capabilityProbe = buf;
      return true;
    } catch { return false; }
  }, mb).catch(() => false);

  const peak = (await readFootprint().catch(() => ({})))?.footprintTotalMB ?? null;

  await page.evaluate(() => { delete window.__capabilityProbe; }).catch(() => {});
  const gc = await forceCollection(page, gcOptions);
  const released = (await readFootprint().catch(() => ({})))?.footprintTotalMB ?? null;

  const roseMB = (baseline != null && peak != null) ? +(peak - baseline).toFixed(1) : null;
  const fellMB = (peak != null && released != null) ? +(peak - released).toFixed(1) : null;
  // Half the probe is a deliberately loose bar. This asks whether the instrument is BLIND, not whether
  // it is precise; allocator slack and lazy decommit both legitimately eat some of a 64 MB round trip.
  const detected = allocated === true && roseMB != null && fellMB != null
    && roseMB >= mb * 0.5 && fellMB >= roseMB * 0.5;

  if (!detected) log(`boot endpoint: CAPABILITY PROBE FAILED — allocated=${allocated} rose=${roseMB} fell=${fellMB}`);
  return {
    probe: 'CAPABILITY-PROBE-01',
    detected,
    what: `a ${mb} MB committed allocation appearing and leaving, on this reading's own footprint path`,
    probeMB: mb,
    baselineMB: baseline, peakMB: peak, releasedMB: released,
    roseMB, fellMB,
    observedMB: roseMB,
    allocated,
    forcedGcOk: gc.forcedGcOk,
    proves: 'the all-Chrome footprint reader used for the floor can resolve a change of this size',
    doesNotProve: 'per-arena attribution in the detailed dump; COV-01 is graded separately',
    why: detected ? null
      : (allocated !== true
        ? 'the probe allocation itself failed, so the instrument was never tested'
        : `the reader saw ${roseMB} MB appear and ${fellMB} MB leave against a ${mb} MB probe; it cannot `
          + 'be trusted to have seen the floor it just reported'),
  };
}

/**
 * @param {object} o
 * @param {import('puppeteer').Page} o.page
 * @param {() => Promise<object>} o.readFootprint      all-Chrome footprint reader
 * @param {() => Promise<object>} o.captureDump        detailed dump (effective_size / COV-01)
 * @param {() => Promise<number|null>} [o.readHeapMB]
 * @param {number[]} [o.rungsMs]
 * @param {object} o.identity          { commit, buildStamp, expectedSha, servedSha, sealDigest }
 * @param {object|null} o.capability   capability proof carried in from the run
 * @param {() => object|null} [o.phaseSummary]
 * @param {string} o.outDir            where the failure sidecar lands if the checklist fails
 */
export async function takeBootEndpointReading({
  page,
  readFootprint,
  captureDump,
  readHeapMB = null,
  rungsMs = DEFAULT_RUNGS_MS,
  identity = null,
  capability = null,
  phaseSummary = null,
  outDir = '.',
  label = 'soak hour-0 canonical settled floor',
  log = () => {},
  /**
   * Injectable only so the self-test can declare production rungs without waiting them. It is the
   * DECLARED rung that SETTLE-CRITERION-V2 grades, so a test that shortened `rungsMs` instead would be
   * proving the criterion can be talked out of its minimum.
   */
  sleepFn = sleep,
  /** Passed straight to `forceCollection`; defaulted so production behaviour is unchanged. */
  gcOptions = undefined,
  runCapabilityProbe = true,
  capabilityProbeMB = 64,
} = {}) {
  const startedAt = new Date().toISOString();

  log('boot endpoint: quiesce');
  const quiescence = await quiesce(page);
  if (!quiescence.quiescent) log(`boot endpoint: QUIESCENCE NOT VERIFIED — ${quiescence.why}`);

  const curve = [];
  let heapBeforeGcMB = null;
  let heapAfterGcMB = null;
  let forcedGcOk = null;

  for (let i = 0; i < rungsMs.length; i += 1) {
    const gap = rungsMs[i];
    if (gap > 0) {
      log(`boot endpoint: rung ${i + 1}/${rungsMs.length} — settle ${(gap / 1000).toFixed(0)}s`);
      await sleepFn(gap);
    }
    // Condition C wants both sides of the collection, and it wants them at the rung that produces the
    // quoted number — hence the last rung's pair is the one that grades.
    const before = readHeapMB ? await readHeapMB() : null;
    const gc = await forceCollection(page, gcOptions);
    const after = readHeapMB ? await readHeapMB() : null;
    const fp = await readFootprint().catch(() => ({}));
    forcedGcOk = gc.forcedGcOk;
    heapBeforeGcMB = before;
    heapAfterGcMB = after;
    curve.push({
      rung: i + 1,
      atMs: gap,
      at: new Date().toISOString(),
      footprintTotalMB: fp?.footprintTotalMB ?? null,
      pageRendererMB: fp?.pageRendererMB ?? null,
      heapBeforeGcMB: before,
      heapAfterGcMB: after,
      heapRoseMB: (before != null && after != null) ? +(after - before).toFixed(2) : null,
      forcedGcOk: gc.forcedGcOk,
      fp,
    });
    log(`boot endpoint: rung ${i + 1} = ${fp?.footprintTotalMB ?? 'n/a'} MB`);
  }

  // The dump is taken at the bottom of the curve, still paused. Taking it after the resume would
  // attribute a floor with a running page's allocations already back in it.
  log('boot endpoint: detailed dump (effective_size / COV-01)');
  const dump = await captureDump().catch((e) => ({ captureError: String(e?.message || e).slice(0, 200) }));

  // Self-proof, after the number it certifies has already been taken. See CAPABILITY-PROBE-01 above
  // for why E's on-disk artifact cannot stand in for this.
  const capabilityProof = capability ?? (runCapabilityProbe
    ? await capabilityProbe(page, { mb: capabilityProbeMB, readFootprint, log, gcOptions })
      .catch((e) => ({ detected: false, what: 'in-situ capability probe', why: String(e?.message || e).slice(0, 160) }))
    : null);

  const resume = await resumePlay(page);
  if (!resume.resumed) log(`boot endpoint: RESUME DID NOT TAKE — ${resume.why}`);

  const reads = curve.map((c) => c.footprintTotalMB).filter((v) => Number.isFinite(v));
  const settle = assessSettled({
    reads,
    rungMs: rungsMs[rungsMs.length - 1],
    quiescent: quiescence.quiescent,
    forcedGcOk,
    heapBeforeGcMB,
    heapAfterGcMB,
    label,
  });

  const lastFp = curve.length ? curve[curve.length - 1].fp : {};
  const bar = assessAgainstBar(lastFp, {
    settled: settle.settled,
    settleMs: rungsMs.reduce((a, b) => a + b, 0),
    what: label,
  });

  // effective_size confirmation. This is the whole reason the floor had to be re-taken: COV-01 was
  // computed on a single pid's arenas over all-Chrome private, and the corrected basis is
  // `effective_size` summed across processes. Confirming the field is PRESENT in this dump is a
  // separate fact from the coverage number clearing 95%, and both are recorded.
  const effectiveSize = {
    check: 'EFFECTIVE-SIZE-CONFIRMATION',
    basis: dump?.sizeBasis ?? null,
    confirmed: dump?.sizeBasis === 'effective_size',
    nodeBasisCounts: dump?.nodeBasisCounts ?? null,
    why: dump?.sizeBasis === 'effective_size' ? null
      : `the dump reported basis ${dump?.sizeBasis ?? 'null'}; COV-01 on this reading is not on the `
        + 'corrected de-duplicated basis and must not be quoted as if it were',
  };

  const sidecarsOnDisk = (dump?.artifactPath ? [dump.artifactPath] : [])
    .map((p) => ({ path: p, exists: fs.existsSync(p) }));

  const validity = assessReading({
    label,
    identity,
    phaseSummary: typeof phaseSummary === 'function' ? phaseSummary() : phaseSummary,
    sidecars: sidecarsOnDisk,
    coverage: dump && !dump.captureError ? dump : null,
    capability: capabilityProof,
  });

  const reading = {
    check: 'BOOT-ENDPOINT-READING-01',
    label,
    startedAt,
    finishedAt: new Date().toISOString(),
    replaces: 'W2 canonical floor re-take (separate host window, cancelled)',
    quiescence,
    resume,
    capabilityProof,
    curve: curve.map(({ fp, ...rest }) => rest),
    rungsMs,
    settle,
    bar,
    effectiveSize,
    coverage: dump ? {
      covState: dump.covState ?? null,
      arenaCoveragePct: dump.arenaCoveragePct ?? null,
      sizeBasis: dump.sizeBasis ?? null,
      processCount: dump.processCount ?? null,
      artifactPath: dump.artifactPath ?? null,
      captureError: dump.captureError ?? null,
    } : null,
    validity,
    // The one number, and the single condition under which it may be quoted.
    floorMB: settle.settled && validity.valid ? (lastFp?.footprintTotalMB ?? null) : null,
    quotable: Boolean(settle.settled && validity.valid),
    notQuotableBecause: (settle.settled && validity.valid) ? null
      : [settle.settled ? null : `SETTLE-CRITERION-V2: ${settle.state}`,
        validity.valid ? null : `READING-VALIDITY-01: ${validity.redRows.concat(validity.unprovenRows).join(', ')}`]
        .filter(Boolean).join(' | '),
  };

  // The failure travels as a file, per the clause. Written next to the reading so a packet assembled
  // from this directory picks it up without anyone remembering to mention it.
  let sidecarPath = null;
  if (!reading.quotable) {
    const sidecar = failureSidecar(validity.valid
      ? { ...validity, valid: false, state: 'INVALID_UNSETTLED', label,
        redRows: ['settleCriterion'], unprovenRows: [],
        rows: { ...validity.rows, settleCriterion: { state: 'RED', reason: settle.why ?? settle.state } } }
      : validity,
    { reading: { floorMB: lastFp?.footprintTotalMB ?? null, curve: reading.curve, settle: settle.state } });
    try {
      fs.mkdirSync(outDir, { recursive: true });
      sidecarPath = path.join(outDir, `READING-VALIDITY-FAILURE-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`);
      fs.writeFileSync(sidecarPath, JSON.stringify({ ...sidecar, settle, effectiveSize }, null, 2));
      log(`boot endpoint: NOT QUOTABLE — failure sidecar at ${sidecarPath}`);
    } catch (e) {
      log(`boot endpoint: sidecar write failed: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  reading.failureSidecarPath = sidecarPath;
  reading.packetRow = reading.quotable
    ? `hour-0 canonical settled floor — ${reading.floorMB} MB — SETTLED, all five validity rows green`
    : `hour-0 canonical settled floor — NOT QUOTABLE — ${reading.notQuotableBecause} — sidecar: ${sidecarPath ?? 'write failed'}`;

  return reading;
}
