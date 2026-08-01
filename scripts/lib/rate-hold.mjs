/**
 * RATE-HOLD — the headline verdict. Effective bars/s at end of arm within 5% of hour 0.
 *
 * WHY THIS REPLACES MEGABYTES: for weeks every gauge has been a proxy — blocking ms/s, freeze cadence,
 * heap slope — and none of them is the complaint. The complaint is that the chart stops delivering bars.
 * A hold RATIO is also comparable across envelopes, which is why it dissolves the baseline argument: it
 * does not matter whether the session runs at 60 bars/s or 10, only whether it still does at hour 10.
 *
 * TWO ROUTES, AND THE JUDGE IS THE MEASURED ONE.
 *
 *   MEASURED (judge)    simulated-time advance divided by wall time. This is delivery: what the user
 *                       actually got. No product dependency, works on today's build.
 *   READ-BACK (witness) A's `__talariaEffectiveRate` from SPEED-01, recorded beside it when it lands.
 *
 * A's read-back is the output of a CONTROLLER that self-corrects on >5% drift — the same 5% that is the
 * RATE-HOLD threshold. A controller reporting its own setpoint reads "held" BY CONSTRUCTION while
 * delivery collapses underneath it. So it is never the judge. If the two disagree, that gap is itself the
 * finding: the engine believes it is keeping up and is not.
 *
 * WHY SIMULATED TIME AND NOT A BAR INDEX: a 1h panel at 60x closes a bar about once a minute, so a
 * bar-index delta cannot tell a slow panel from a stalled one. `replayTimestamp` is continuous, so it can.
 * conf01-session.mjs already carries that warning in a comment; this module obeys it.
 */

/** Bars/s of the base timeframe, derived from how far the replay clock actually moved. */
export function deliveredRate(prev, next, { baseTimeframeSec = 60 } = {}) {
  if (!prev || !next) return { ok: false, why: 'need two samples' };
  const wallSec = (next.atMs - prev.atMs) / 1000;
  if (!(wallSec > 0)) return { ok: false, why: 'non-positive wall interval' };

  const simMs = next.replayTimestamp != null && prev.replayTimestamp != null
    ? next.replayTimestamp - prev.replayTimestamp : null;
  const idxDelta = next.replayIndex != null && prev.replayIndex != null
    ? next.replayIndex - prev.replayIndex : null;

  // A re-seek moves the playhead without delivering bars, and a wrap reads negative. Either way the
  // interval is not a delivery measurement and must not be averaged into one.
  if (simMs != null && simMs < 0) return { ok: false, why: 'playhead moved backwards — re-seek or wrap, not delivery' };

  const bySim = simMs != null ? (simMs / 1000 / baseTimeframeSec) / wallSec : null;
  const byIndex = idxDelta != null && idxDelta >= 0 ? idxDelta / wallSec : null;

  return {
    ok: bySim != null || byIndex != null,
    barsPerSec: bySim != null ? +bySim.toFixed(4) : (byIndex != null ? +byIndex.toFixed(4) : null),
    route: bySim != null ? 'simulated-time' : (byIndex != null ? 'replay-index' : null),
    bySimulatedTime: bySim != null ? +bySim.toFixed(4) : null,
    byReplayIndex: byIndex != null ? +byIndex.toFixed(4) : null,
    wallSec: +wallSec.toFixed(2),
  };
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * @param samples [{hours, barsPerSec, speed}]
 * Baseline is a SETTLED window, not the first reading. Delivered rate falls 20.6 -> 9.19 bars/s during
 * warm-up on my own monotonic run, so anchoring hour 0 at t=0 would grade every build against a transient
 * it can never hold. The window is declared, and the naive first-sample ratio is reported beside it so the
 * baseline choice is auditable rather than convenient.
 */
export function evaluateRateHold(samples, {
  baselineFromHours = 0.05,
  baselineToHours = 0.25,
  finalWindowHours = 0.5,
  tolerance = 0.05,
  minSamplesPerWindow = 3,
} = {}) {
  const usable = (samples || []).filter((s) => Number.isFinite(s.barsPerSec) && Number.isFinite(s.hours));
  if (usable.length < minSamplesPerWindow * 2) {
    return { verdict: 'VOID', why: `only ${usable.length} usable samples; RATE-HOLD needs two populated windows.`, publishable: false };
  }

  // A speed change mid-run makes the two windows different experiments.
  const speeds = new Set(usable.map((s) => s.speed).filter((v) => v != null));
  if (speeds.size > 1) {
    return { verdict: 'VOID', why: `replay speed changed mid-run (${[...speeds].join(', ')}); hour 0 and end of arm are not the same experiment.`, publishable: false };
  }

  const lastHour = usable[usable.length - 1].hours;
  const base = usable.filter((s) => s.hours >= baselineFromHours && s.hours <= baselineToHours);
  const fin = usable.filter((s) => s.hours >= lastHour - finalWindowHours);

  if (base.length < minSamplesPerWindow) {
    return { verdict: 'VOID', why: `baseline window ${baselineFromHours}-${baselineToHours} h holds ${base.length} samples, need ${minSamplesPerWindow}.`, publishable: false };
  }
  if (fin.length < minSamplesPerWindow) {
    return { verdict: 'VOID', why: `final window (last ${finalWindowHours} h) holds ${fin.length} samples, need ${minSamplesPerWindow}.`, publishable: false };
  }

  const b = median(base.map((s) => s.barsPerSec));
  const f = median(fin.map((s) => s.barsPerSec));
  if (!(b > 0)) return { verdict: 'VOID', why: `baseline rate is ${b}; a ratio against zero says nothing.`, publishable: false };

  const ratio = f / b;
  const naive = usable[0].barsPerSec > 0 ? +(f / usable[0].barsPerSec).toFixed(4) : null;

  return {
    verdict: ratio >= 1 - tolerance ? 'RATE-HOLD PASS' : 'RATE-HOLD FAIL',
    publishable: true,
    holdRatio: +ratio.toFixed(4),
    lostPercent: +((1 - ratio) * 100).toFixed(1),
    baselineBarsPerSec: +b.toFixed(3),
    finalBarsPerSec: +f.toFixed(3),
    baselineWindow: `${baselineFromHours}-${baselineToHours} h (${base.length} samples, median)`,
    finalWindow: `last ${finalWindowHours} h (${fin.length} samples, median)`,
    hoursCovered: +lastHour.toFixed(2),
    speed: [...speeds][0] ?? null,
    naiveFirstSampleRatio: naive,
    baselineNote: 'Baseline is a SETTLED window, not the first sample. Delivered rate falls steeply during warm-up (20.6 -> 9.19 bars/s measured), so a t=0 anchor grades every build against a transient. naiveFirstSampleRatio is published so the choice is auditable.',
    why: ratio >= 1 - tolerance
      ? `Delivery held: ${(+f.toFixed(2))} bars/s at ${lastHour.toFixed(1)} h against ${(+b.toFixed(2))} at hour 0, ratio ${ratio.toFixed(3)} within the 5% bar.`
      : `Delivery DECAYED: ${(+f.toFixed(2))} bars/s at ${lastHour.toFixed(1)} h against ${(+b.toFixed(2))} at hour 0 — ${((1 - ratio) * 100).toFixed(1)}% lost, bar is 5%.`,
  };
}

/**
 * A's read-back, recorded as a witness. Never the judge — see the header.
 * Read across every realm because a per-panel governor can hold one panel and starve three.
 */
export async function readEffectiveRateReadback(page) {
  const frames = page.frames();
  const out = [];
  for (const fr of frames) {
    try {
      const v = await fr.evaluate(() => {
        const raw = window.__talariaEffectiveRate;
        if (raw === undefined) return { present: false };
        let val = raw;
        if (typeof raw === 'function') { try { val = raw(); } catch (e) { return { present: true, callFailed: String(e).slice(0, 80) }; } }
        if (val && typeof val === 'object') {
          return { present: true, shape: 'object', barsPerSec: Number(val.barsPerSec ?? val.rate ?? val.effective ?? NaN), keys: Object.keys(val).slice(0, 8) };
        }
        return { present: true, shape: typeof val, barsPerSec: Number(val) };
      });
      if (v?.present) out.push({ url: String(fr.url()).slice(0, 90), ...v });
    } catch { /* a frame can navigate mid-read; it is a witness, not the judge */ }
  }
  return {
    present: out.length > 0,
    realms: out.length,
    values: out,
    absentNote: out.length ? null : 'ABSENT. __talariaEffectiveRate is not in the served bytes; it lands with A\'s SPEED-01. RATE-HOLD is judged on measured delivery regardless, so this is a missing witness, not a missing verdict.',
  };
}
