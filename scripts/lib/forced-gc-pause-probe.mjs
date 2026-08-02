/**
 * FORCED-GC-PAUSE-PROBE-V1 — checklist item 9. Replaces PAUSE-PROBE-V1; pause-and-wait is retired.
 *
 * WHY THE OLD PROBE IS RETIRED. `pause-probe.mjs` drained by pausing and waiting, explicitly refusing
 * to force a collection, on the reasoning that forcing GC produced my 1.38 GB false ceiling. That
 * reasoning is now known to be backwards: pause releases essentially nothing, so every "hoard floor"
 * it produced was a running total with the froth still in it — inflated by roughly the 281.7 MB a
 * real collection takes. Floors published from it are not floors.
 *
 * WHAT THIS PROBE DOES DIFFERENTLY. It takes BOTH readings in one probe:
 *   running -> pause (verified) -> +60 s pause-only read -> settle -> forced collection -> floor read
 * so `pauseOnlyFloorMB` (what the old instrument would have reported) and `forcedGcFloorMB` (the real
 * floor) come from the same session at the same moment. `pauseAndWaitInflationMB` is their difference.
 * The retirement is therefore demonstrated per run rather than asserted once and cited forever.
 *
 * FULL VECTOR: when `readArenas` is supplied, each stage carries the whole arena column set plus the
 * TOTAL-01 total, so a floor can never be quoted as a single number with no composition behind it.
 */

import { forceCollection, gradeSettle, SETTLE_DEFAULT_MS, SETTLE_MIN_MS } from './settle-protocol.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setPlaying(page, want) {
  return page.evaluate((play) => {
    const found = [];
    const visit = (w) => {
      try {
        const rs = w.replaySystem || w.chart?.replaySystem || w.multichartManager?.charts?.[0]?.replaySystem;
        if (!rs) return;
        const was = !!rs.isPlaying;
        if (play && !rs.isPlaying && typeof rs.play === 'function') rs.play();
        if (!play && rs.isPlaying && typeof rs.pause === 'function') rs.pause();
        found.push({ was, now: !!rs.isPlaying });
      } catch (_) { /* a realm may not carry a replay system */ }
    };
    visit(window);
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i]); } catch (_) { /* cross-origin */ } }
    return found;
  }, want).catch((e) => ({ error: String(e).slice(0, 120) }));
}

/**
 * @param {import('puppeteer').Page} page
 * @param {object} o
 * @param {() => Promise<object>} o.readFootprint async () => ({ footprintTotalMB, ... })
 * @param {() => Promise<object>} [o.readArenas] async () => arena column object (full vector)
 * @param {number} [o.frothWaitMs] pause-only comparison read, kept for continuity with the old series
 * @param {number} [o.settleMs] settle before the forced collection (SETTLE-PROTOCOL band)
 */
export async function forcedGcPauseProbe(page, {
  readFootprint,
  readArenas = null,
  frothWaitMs = 60_000,
  settleMs = SETTLE_DEFAULT_MS,
  label = 'checkpoint',
  log = () => {},
} = {}) {
  const t0 = Date.now();
  const out = {
    signature: 'FORCED-GC-PAUSE-PROBE-V1',
    supersedes: 'PAUSE-PROBE-V1 (pause-and-wait, no forced collection) — retired, item 9',
    label,
    startedAt: new Date().toISOString(),
    steps: [],
  };

  const readAll = async (stage) => {
    const fp = await readFootprint().catch((e) => ({ error: String(e).slice(0, 120) }));
    const arenas = readArenas ? await readArenas().catch((e) => ({ arenaReadError: String(e).slice(0, 120) })) : null;
    const rec = {
      stage,
      atMs: Date.now(),
      sinceStartSec: Math.round((Date.now() - t0) / 1000),
      ...fp,
      ...(arenas || {}),
    };
    out.steps.push(rec);
    log(`forced-gc-probe[${label}] ${stage}: ${rec.footprintTotalMB ?? '?'} MB`);
    return rec;
  };

  const running = await readAll('running');

  const paused = await setPlaying(page, false);
  out.pauseResult = paused;
  const pausedOk = Array.isArray(paused) && paused.length > 0 && paused.every((p) => p.now === false);
  out.pausedVerified = pausedOk;
  if (!pausedOk) {
    out.verdict = 'VOID';
    out.why = `the pause was not verified in every realm (${JSON.stringify(paused).slice(0, 160)}). `
      + 'Readings taken while playing measure delivery, not a floor.';
    await setPlaying(page, true);
    return out;
  }

  // Stage 1: what the RETIRED instrument would have reported. Kept so the retirement is evidenced.
  await sleep(frothWaitMs);
  const pauseOnly = await readAll('pause-only-60s');

  // Stage 2: settle, then force collection. This is the floor.
  await sleep(Math.max(0, settleMs));
  const settleWaitedMs = settleMs;
  const gc = await forceCollection(page);
  out.forcedGc = gc;
  const floorRec = await readAll('after-forced-collection');

  const resumed = await setPlaying(page, true);
  out.resumeResult = resumed;
  out.resumeVerified = Array.isArray(resumed) && resumed.length > 0 && resumed.every((p) => p.now === true);

  const run = running.footprintTotalMB ?? null;
  const pauseFloor = pauseOnly.footprintTotalMB ?? null;
  const gcFloor = floorRec.footprintTotalMB ?? null;

  const grade = gradeSettle({ settleWaitedMs, forcedGcOk: gc.forcedGcOk, minMs: SETTLE_MIN_MS });
  Object.assign(out, grade);
  out.settleMs = settleMs;
  out.settleWaitedMs = settleWaitedMs;

  out.probeSpanSec = Math.round((Date.now() - t0) / 1000);
  out.runningMB = run;
  out.pauseOnlyFloorMB = pauseFloor;
  out.forcedGcFloorMB = gcFloor;
  /** The field the soak already reads. Points at the REAL floor now, not the pause reading. */
  out.hoardFloorMB = gcFloor;
  out.pauseAndWaitInflationMB = (pauseFloor != null && gcFloor != null) ? +(pauseFloor - gcFloor).toFixed(1) : null;
  out.frothDrainedByPauseMB = (run != null && pauseFloor != null) ? +(run - pauseFloor).toFixed(1) : null;
  out.releasedByCollectionMB = (pauseFloor != null && gcFloor != null) ? +(pauseFloor - gcFloor).toFixed(1) : null;
  out.frothPercentOfRunning = (run > 0 && gcFloor != null) ? +(((run - gcFloor) / run) * 100).toFixed(1) : null;

  if (gcFloor == null) {
    out.verdict = 'VOID';
    out.why = 'no footprint reading survived the forced collection, so there is no floor.';
    return out;
  }
  if (!gc.forcedGcOk) {
    out.verdict = 'VOID';
    out.why = 'forced collection did not run, so this probe degenerated to the retired pause-and-wait instrument. '
      + 'Refusing to report its reading as a floor.';
    return out;
  }

  out.verdict = 'MEASURED';
  out.why = `Running ${run} MB. Pause-and-wait alone reached ${pauseFloor} MB — that is what the retired probe `
    + `would have called the floor. Forced collection then released a further ${out.releasedByCollectionMB} MB `
    + `to a real floor of ${gcFloor} MB. Pause-and-wait was inflating the floor by ${out.pauseAndWaitInflationMB} MB `
    + `on this reading; ${out.frothPercentOfRunning}% of the running total was not hoard.`;
  return out;
}
