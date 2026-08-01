/**
 * PAUSE-PROBE — separate froth from hoard.
 *
 * sample -> pause -> sample at +60 s (froth drains) -> sample at +10 min (slow reclaim) -> resume.
 * What is left after both drains is HOARD, and hoard is what the memory bar judges.
 *
 * WHY: a running replay carries transient allocation that a fast soak reports as retention. Every
 * megabyte figure I have published is a RUNNING total, so it contains an unknown amount of froth. The
 * 1,024 MB bar was set against those totals. Until the floor is measured this way, nobody knows how much
 * of any breach is real.
 *
 * The probe PAUSES the product; it does not collect. Forcing GC was the confound that produced my own
 * 1.38 GB false ceiling, and a forced collection measures what the collector can reach, not what the
 * process holds. Draining by waiting is slower and honest.
 *
 * DURING THE PAUSE THE ARM IS NOT DELIVERING BARS. The window is excluded from RATE-HOLD by returning its
 * span, so a probe can never be read as a delivery stall.
 */

const MB = 1024 * 1024;

export async function pauseProbe(page, {
  readFootprint,                 // async () => ({ footprintTotalMB, ... })
  frothWaitMs = 60000,
  reclaimWaitMs = 600000,
  label = 'checkpoint',
  log = () => {},
  skipReclaim = false,           // short arms may take the 60 s half only, declared in the artifact
} = {}) {
  const t0 = Date.now();
  const out = { signature: 'PAUSE-PROBE-V1', label, startedAt: new Date().toISOString(), steps: [] };

  const readAll = async (stage) => {
    const fp = await readFootprint().catch((e) => ({ error: String(e).slice(0, 120) }));
    const rec = { stage, atMs: Date.now(), sinceStartSec: Math.round((Date.now() - t0) / 1000), ...fp };
    out.steps.push(rec);
    log(`pause-probe[${label}] ${stage}: ${rec.footprintTotalMB ?? '?'} MB`);
    return rec;
  };

  const setPlaying = async (want) => page.evaluate((play) => {
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

  const running = await readAll('running');

  const paused = await setPlaying(false);
  out.pauseResult = paused;
  // VERIFIED, not assumed: a pause that did not pause makes every later reading a running reading, and
  // the probe would report froth as hoard while looking perfectly healthy.
  const pausedOk = Array.isArray(paused) && paused.length > 0 && paused.every((p) => p.now === false);
  out.pausedVerified = pausedOk;
  if (!pausedOk) {
    out.verdict = 'VOID';
    out.why = `the pause was not verified in every realm (${JSON.stringify(paused).slice(0, 160)}). Readings taken while playing measure froth plus delivery, not a floor.`;
    await setPlaying(true);
    return out;
  }

  await new Promise((r) => setTimeout(r, frothWaitMs));
  const froth = await readAll('after-froth-60s');

  let reclaim = null;
  if (!skipReclaim) {
    await new Promise((r) => setTimeout(r, reclaimWaitMs));
    reclaim = await readAll('after-reclaim-10min');
  }

  const resumed = await setPlaying(true);
  out.resumeResult = resumed;
  out.resumeVerified = Array.isArray(resumed) && resumed.length > 0 && resumed.every((p) => p.now === true);

  const run = running.footprintTotalMB;
  const f60 = froth.footprintTotalMB;
  const f10 = reclaim?.footprintTotalMB ?? null;
  const floor = f10 ?? f60;

  out.probeSpanSec = Math.round((Date.now() - t0) / 1000);
  out.runningMB = run ?? null;
  out.frothDrainedMB = run != null && f60 != null ? +(run - f60).toFixed(1) : null;
  out.slowReclaimedMB = f60 != null && f10 != null ? +(f60 - f10).toFixed(1) : null;
  out.hoardFloorMB = floor ?? null;
  out.frothPercentOfRunning = run > 0 && floor != null ? +(((run - floor) / run) * 100).toFixed(1) : null;
  out.reclaimMeasured = !skipReclaim;
  out.verdict = floor != null ? 'MEASURED' : 'VOID';
  out.why = floor != null
    ? `Running ${run} MB drained to ${floor} MB. ${out.frothPercentOfRunning}% of the running total was froth${skipReclaim ? ' (60 s drain only; the 10-minute reclaim was skipped and this floor is an UPPER bound on hoard)' : ''}. Hoard is ${floor} MB and hoard is what the bar judges.`
    : 'no footprint reading survived the probe.';
  return out;
}
