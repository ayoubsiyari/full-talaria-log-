/**
 * DETAILED-DUMP-CAPTURE — E's item 6 capture, callable INLINE from an instrument that already owns a
 * browser.
 *
 * WHY THIS IS A LIBRARY AND NOT A SECOND PROCESS
 * E's standalone attempt at 19:14:30+01:00 returned NO_LIVE_SOAK_BROWSER, and that was not a bug in
 * E's watcher. The queue hands the box over by EMPTYING it, so the moment E holds the slot there is no
 * chart browser left to attach to. Nobody can both hold the slot and have a live page to read. The
 * capture therefore has to be called by whoever already has the browser open.
 *
 * WHAT THE FORTY POINTS ACTUALLY ARE — and it is not what the coverage number looks like
 * Pass 3 read 59.84% named coverage: 403.85 MB named against a 674.9 MB total. The obvious reading is
 * that 271.05 MB of renderer memory has no name. That reading is WRONG, and my own W90 census says so:
 * a single renderer's allocator roots summed to 310.9 MB against 311.21 MB of that process's private
 * footprint — 99.9% coverage. There is almost nothing unnamed inside a renderer.
 *
 * The gap is a BASIS MISMATCH. The numerator came from one pid (6920 in pass 3); the denominator,
 * `totalBasis: 'all-chrome-process-private'`, spans every Chrome process — GPU, browser, network
 * service, the other renderers. We were dividing one process's arenas by the whole browser's memory.
 *
 * So a detailed dump alone would not have moved the number by a single point: detail subdivides roots
 * that are already counted. Detail is still needed, and it is what E built — it is how `partition_alloc`
 * and `blink_gc` growth gets a NAME. But what closes COV-01 is summing named roots across ALL pids
 * against that same all-process total.
 *
 * WHY `effective_size` AND NOT `size`
 * The same W90 census recorded the trap: GPU roots summed to 206 MB against 156 MB of private memory,
 * because memory-infra roots OVERLAP when you sum `size`. Summing `size` across every process would
 * produce coverage above 100% and would be a worse failure than 59.84% — a number that looks complete
 * because it is double-counted. `effective_size` is Chrome's own de-duplicated figure and is what this
 * module sums. When it is absent the row says so and is not quietly treated as equivalent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { summariseAllocatorDetail } from './blink-allocator-detail.mjs';

const MB = 1048576;

/** Roots-only prefixes are not filtered here: COV-01 wants every named root, not a chosen few. */
export const CAPTURE_VERSION = 'DETAILED-DUMP-CAPTURE-V1';

/**
 * Read one allocator node's bytes, preferring Chrome's de-duplicated `effective_size`.
 * @returns {{bytes:number|null, basis:'effective_size'|'size'|null}}
 */
export function nodeBytes(node) {
  const read = (raw) => {
    if (raw == null) return null;
    const n = typeof raw === 'string' ? parseInt(raw, 16) : Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const eff = read(node?.attrs?.effective_size?.value);
  if (eff != null) return { bytes: eff, basis: 'effective_size' };
  const size = read(node?.attrs?.size?.value);
  if (size != null) return { bytes: size, basis: 'size' };
  return { bytes: null, basis: null };
}

/**
 * Named roots for ONE process, plus that process's own private footprint when the dump carries it.
 * Children are skipped: they are already inside their root, and adding them would double-count.
 */
export function summarisePidRoots(dump) {
  const allocators = dump?.allocators || {};
  const rootsMB = {};
  let sizeBasisUsed = false;
  let effectiveBasisUsed = false;

  for (const [name, node] of Object.entries(allocators)) {
    if (name.includes('/')) continue;
    const { bytes, basis } = nodeBytes(node);
    if (bytes == null) continue;
    if (basis === 'size') sizeBasisUsed = true;
    if (basis === 'effective_size') effectiveBasisUsed = true;
    rootsMB[name] = +(bytes / MB).toFixed(3);
  }

  const totals = dump?.process_totals || {};
  const privRaw = totals.private_footprint_bytes ?? totals.private_footprint_kb ?? null;
  let privateMB = null;
  if (privRaw != null) {
    const n = typeof privRaw === 'string' ? parseInt(privRaw, 16) : Number(privRaw);
    if (Number.isFinite(n)) privateMB = +((totals.private_footprint_kb != null ? n * 1024 : n) / MB).toFixed(3);
  }

  const namedMB = +Object.values(rootsMB).reduce((a, b) => a + b, 0).toFixed(3);
  return {
    rootsMB,
    namedMB,
    privateMB,
    /**
     * SCHEMA FINGERPRINT, always recorded and deliberately tiny.
     *
     * "Do real Chrome dumps carry `effective_size`?" could not be answered from any of the 183
     * artifacts on disk, because every instrument summarised the trace and discarded the events. A
     * question about a field nobody kept cannot be asked retrospectively, and re-running a host to
     * recover it costs a slot in a queue that has been contended all night. Counting which bases the
     * nodes actually used costs a few bytes and makes the question answerable from the artifact.
     */
    nodeBasisCounts: Object.entries(allocators).reduce((acc, [name, n]) => {
      if (name.includes('/')) return acc;
      const b = nodeBytes(n).basis;
      if (b) acc[b] = (acc[b] || 0) + 1; else acc.none = (acc.none || 0) + 1;
      return acc;
    }, {}),
    sizeBasis: effectiveBasisUsed && !sizeBasisUsed ? 'effective_size'
      : effectiveBasisUsed ? 'mixed' : sizeBasisUsed ? 'size' : null,
  };
}

/**
 * COV-01 across every process in one dump.
 *
 * States are kept distinct on purpose (BIND-01): an instrument that could not dump must never be
 * reported as a process with no named memory. Those two produce the same "0" and mean opposite things.
 *
 * @param {Map<number,object>|Array} perPid output of summarisePidRoots keyed by pid
 * @param {{totalPrivateMB:number|null}} opts TOTAL-01 total this is measured against
 */
export function coverageAcrossProcesses(perPid, { totalPrivateMB = null } = {}) {
  const entries = perPid instanceof Map ? [...perPid.entries()] : Object.entries(perPid || {});
  if (entries.length === 0) {
    return {
      covState: 'DUMP_UNAVAILABLE',
      arenaNamedTotalMB: null,
      arenaCoveragePct: null,
      arenaUnattributedMB: null,
      processCount: 0,
      note: 'no process produced an allocator dump; this is an instrument failure, not zero named memory',
    };
  }

  const namedTotal = +entries.reduce((a, [, v]) => a + (v?.namedMB || 0), 0).toFixed(3);
  const bases = new Set(entries.map(([, v]) => v?.sizeBasis).filter(Boolean));
  // `Number(null)` is 0 and 0 is finite, so a bare isFinite check turns "no total was supplied" into
  // "the total is zero" — the same coercion that made TOTAL-01 report a total it did not have.
  const totalRaw = (totalPrivateMB === null || totalPrivateMB === undefined || totalPrivateMB === '')
    ? null : Number(totalPrivateMB);
  const total = Number.isFinite(totalRaw) ? totalRaw : null;

  const pct = (total != null && total > 0) ? +((namedTotal / total) * 100).toFixed(2) : null;
  const overshoot = pct != null && pct > 100.5;

  return {
    covState: total == null ? 'TOTAL_ABSENT'
      : overshoot ? 'OVERLAP_SUSPECTED'
        : 'MEASURED',
    arenaNamedTotalMB: namedTotal,
    totalPrivateMB: total,
    arenaCoveragePct: pct,
    arenaUnattributedMB: (total != null) ? +(total - namedTotal).toFixed(3) : null,
    arenaCoverageMeets95: pct == null ? null : (pct >= 95 && !overshoot),
    processCount: entries.length,
    sizeBasis: bases.size === 1 ? [...bases][0] : bases.size ? 'mixed' : null,
    // Sized above 100% means roots overlapped, which is what summing `size` does to the GPU process.
    // It is reported as its own state rather than as excellent coverage.
    note: overshoot
      ? 'named exceeds the total, so roots overlapped — coverage is not additive and must not be quoted'
      : bases.has('size')
        ? 'at least one process fell back to `size`; roots there may overlap and coverage may read high'
        : null,
  };
}

/**
 * Take ONE detailed memory-infra dump on a browser this caller already owns.
 *
 * Returns per-pid roots for COV-01 (all processes) AND E's child-level detail for the heaviest
 * renderer, which is the part that gives partition_alloc and blink_gc growth a name.
 *
 * @param {import('puppeteer').Browser} browser
 */
export async function captureDetailedDump(browser, {
  totalPrivateMB = null,
  settleMs = 1500,
  moment = null,
  outDir = null,
  timeoutMs = 60_000,
} = {}) {
  const startedAt = new Date().toISOString();
  let cdp = null;
  try {
    cdp = await browser.target().createCDPSession();
    const events = [];
    const onData = (e) => { if (Array.isArray(e?.value)) events.push(...e.value); };
    cdp.on('Tracing.dataCollected', onData);
    const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));

    await cdp.send('Tracing.start', {
      transferMode: 'ReportEvents',
      traceConfig: {
        includedCategories: ['disabled-by-default-memory-infra'],
        memoryDumpConfig: {},
      },
    });
    await new Promise((r) => setTimeout(r, 400));
    await cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' });
    await new Promise((r) => setTimeout(r, settleMs));
    await cdp.send('Tracing.end');
    // A trace that never completes would park the instrument, which is the exact failure E documented
    // in the soak. Bounded here too: a dump we did not finish reading is a named miss, not a hang.
    await Promise.race([
      complete,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`tracingComplete did not arrive in ${timeoutMs} ms`)), timeoutMs)),
    ]);
    cdp.off('Tracing.dataCollected', onData);

    const perPid = new Map();
    const detailByPid = new Map();
    for (const e of events) {
      const dumps = e?.args?.dumps;
      if (e.ph !== 'v' || !dumps?.allocators) continue;
      perPid.set(e.pid, summarisePidRoots(dumps));
      detailByPid.set(e.pid, summariseAllocatorDetail(dumps.allocators));
    }

    // Heaviest by the arenas that carry this investigation, for the child-level attribution rows.
    let heaviest = null;
    for (const [pid, v] of perPid) {
      const r = v.rootsMB || {};
      const score = (r.v8 || 0) + (r.partition_alloc || 0) + (r.blink_gc || 0);
      if (!heaviest || score > heaviest.score) heaviest = { pid, score };
    }

    const cov = coverageAcrossProcesses(perPid, { totalPrivateMB });
    const result = {
      captureVersion: CAPTURE_VERSION,
      moment,
      startedAt,
      ...cov,
      perPid: [...perPid.entries()].map(([pid, v]) => ({
        pid, namedMB: v.namedMB, privateMB: v.privateMB, sizeBasis: v.sizeBasis, rootsMB: v.rootsMB,
      })),
      heaviestPid: heaviest?.pid ?? null,
      heaviestDetail: heaviest ? detailByPid.get(heaviest.pid) ?? null : null,
    };

    /**
     * E's artifact contract, so E's parser consumes these without a translation step:
     * `<outDir>/<moment>.detailed-dump.json` carrying `signature`, `moment`, `processes[]` and
     * `selectedPid`. The one deviation is deliberate and is the whole point of this module — E's
     * handoff snippet computed the row as `arenaColumns(heaviest.rootsMB, { totalPrivateMB })`, which
     * is single-pid over an all-process total and would have reproduced 59.84% exactly. The corrected
     * all-process coverage travels alongside, and the single-pid figure is kept beside it as
     * `singlePidCoverage` so the two bases can be compared rather than one silently replacing the other.
     */
    if (outDir && moment) {
      try {
        const heaviestNamed = heaviest ? perPid.get(heaviest.pid)?.namedMB ?? null : null;
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${String(moment).replace(/[^\w.@-]+/g, '_')}.detailed-dump.json`),
          `${JSON.stringify({
            signature: 'DETAILED-DUMP-CAPTURE-V1',
            at: startedAt,
            moment,
            totalPrivateMB,
            totalBasis: 'all-chrome-process-private',
            processes: [...detailByPid.entries()].map(([pid, allocatorDetail]) => ({ pid, allocatorDetail })),
            selectedPid: heaviest?.pid ?? null,
            row: result,
            singlePidCoverage: (heaviestNamed != null && Number(totalPrivateMB) > 0)
              ? +((heaviestNamed / Number(totalPrivateMB)) * 100).toFixed(2) : null,
            singlePidCoverageNote: 'the basis that produced the published 59.84%; kept for comparison, not for quoting',
          }, null, 2)}\n`);
        result.artifactDir = outDir;
      } catch (e) {
        // A dump we took but could not file is still a valid reading; losing the file must not lose it.
        result.artifactWriteError = String(e?.message || e).slice(0, 160);
      }
    }
    return result;
  } catch (err) {
    // Distinct from low coverage, and deliberately carries a null percentage rather than a zero.
    return {
      captureVersion: CAPTURE_VERSION,
      moment,
      startedAt,
      covState: 'CAPTURE_FAILED',
      arenaCoveragePct: null,
      arenaNamedTotalMB: null,
      arenaUnattributedMB: null,
      captureError: String(err?.message || err).slice(0, 200),
    };
  } finally {
    try { if (cdp) await cdp.detach(); } catch { /* the browser may already be gone */ }
  }
}
