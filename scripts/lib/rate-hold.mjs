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

  /**
   * THE UNIT IS MARKET-SECONDS DELIVERED PER WALL-SECOND, and bars/s is now derived display.
   *
   * The quantity was always this: the primary route divides simulated-time advance by wall time, then
   * divided AGAIN by the timeframe to express it as bars. Dropping that second division is the whole
   * change - the measurement did not move, only what it is called.
   *
   * It is the better unit because it survives a timeframe change and the amendment's sub-TF stepping,
   * both of which alter what "a bar" means while leaving market time alone. A bars/s series that spans a
   * step change silently compares two different denominators.
   */
  const marketSecPerWallSec = simMs != null ? (simMs / 1000) / wallSec : null;
  const bySim = marketSecPerWallSec != null ? marketSecPerWallSec / baseTimeframeSec : null;
  const byIndex = idxDelta != null && idxDelta >= 0 ? idxDelta / wallSec : null;

  return {
    ok: marketSecPerWallSec != null || byIndex != null,
    // PRIMARY, and the judged quantity.
    marketSecPerWallSec: marketSecPerWallSec != null ? +marketSecPerWallSec.toFixed(4) : null,
    // DERIVED DISPLAY. Carries its denominator so it can never be read without one.
    barsPerSec: bySim != null ? +bySim.toFixed(4) : (byIndex != null ? +byIndex.toFixed(4) : null),
    barsPerSecDenominatorSec: baseTimeframeSec,
    route: marketSecPerWallSec != null ? 'simulated-time' : (byIndex != null ? 'replay-index' : null),
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
  // Legacy series only: converts bars/s to market-seconds. Explicit rather than defaulted, because
  // assuming a timeframe silently rescales the verdict by that timeframe.
  assumeDenominatorSec = null,
} = {}) {
  /**
   * Judged on MARKET-SECONDS PER WALL-SECOND. Samples are read on the new field with a fall-back to the
   * derived one, so a series recorded before the unit settled is still gradeable - but the fall-back
   * needs the timeframe to convert, and a mixed-denominator series is refused below rather than averaged.
   */
  /**
   * THE PRIMARY AND THE DISPLAY MUST AGREE.
   *
   * Now that bars/s is derived, a sample can carry both fields and have them contradict - and the judge
   * would silently believe the primary while a reader believed the display. Caught this on my own drive
   * script the moment the unit changed: fixtures that decayed only bars/s produced "0% lost, ratio 1" on
   * a series built to lose half its delivery. In an artifact that is a wrong verdict with no symptom.
   */
  const inconsistent = (samples || []).filter((s) => Number.isFinite(s.marketSecPerWallSec)
    && Number.isFinite(s.barsPerSec) && Number.isFinite(s.barsPerSecDenominatorSec)
    && Math.abs(s.barsPerSec * s.barsPerSecDenominatorSec - s.marketSecPerWallSec) > Math.max(0.01, 0.01 * Math.abs(s.marketSecPerWallSec)));
  if (inconsistent.length) {
    const e = inconsistent[0];
    return {
      verdict: 'VOID', publishable: false,
      why: `${inconsistent.length} samples disagree between the primary unit and its derived display (e.g. marketSecPerWallSec ${e.marketSecPerWallSec} vs barsPerSec ${e.barsPerSec} x ${e.barsPerSecDenominatorSec} s = ${(e.barsPerSec * e.barsPerSecDenominatorSec).toFixed(2)}). One of the two was written by something that does not know about the other.`,
    };
  }

  const mapped = (samples || []).map((s) => {
    if (Number.isFinite(s.marketSecPerWallSec)) return { ...s, rate: s.marketSecPerWallSec, rateUnit: 'marketSecPerWallSec' };
    // A legacy series carries bars/s with no denominator. It is CONVERTIBLE, not unusable - but only
    // with a timeframe, and inventing one would silently rescale the verdict. Marked, then refused
    // below by name rather than dropped by a filter, because a sample that vanishes from a median is
    // the quietest way to get a wrong answer.
    const denom = Number.isFinite(s.barsPerSecDenominatorSec) ? s.barsPerSecDenominatorSec : assumeDenominatorSec;
    if (Number.isFinite(s.barsPerSec) && Number.isFinite(denom)) {
      return { ...s, rate: s.barsPerSec * denom, rateUnit: Number.isFinite(s.barsPerSecDenominatorSec) ? 'derived-from-barsPerSec' : 'derived-with-assumed-denominator' };
    }
    return { ...s, rate: null, rateUnit: Number.isFinite(s.barsPerSec) ? 'barsPerSec-without-denominator' : 'unreadable' };
  });
  const unconvertible = mapped.filter((s) => s.rate == null && s.rateUnit === 'barsPerSec-without-denominator');
  if (unconvertible.length && unconvertible.length === mapped.filter((s) => s.rate == null || Number.isFinite(s.rate)).length - mapped.filter((s) => Number.isFinite(s.rate)).length) {
    return {
      verdict: 'VOID', publishable: false,
      why: `${unconvertible.length} samples carry barsPerSec with no base timeframe, so they cannot be converted to market-seconds. Pass assumeDenominatorSec to grade a legacy series, and say so when publishing it.`,
    };
  }
  const usable = mapped.filter((s) => Number.isFinite(s.rate) && Number.isFinite(s.hours));

  // A step or timeframe change alters what a bar IS. Market time is immune, but a series whose samples
  // were recorded against different denominators cannot be pooled without saying so.
  const denominators = new Set(usable.map((s) => s.barsPerSecDenominatorSec).filter((v) => v != null));
  if (denominators.size > 1) {
    return { verdict: 'VOID', why: `the base timeframe changed mid-run (${[...denominators].join(', ')} s); bars/s spans two denominators. Market-seconds are comparable but the display unit is not.`, publishable: false };
  }
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

  const b = median(base.map((s) => s.rate));
  const f = median(fin.map((s) => s.rate));
  if (!(b > 0)) return { verdict: 'VOID', why: `baseline rate is ${b}; a ratio against zero says nothing.`, publishable: false };

  const ratio = f / b;
  const naive = usable[0].rate > 0 ? +(f / usable[0].rate).toFixed(4) : null;

  return {
    verdict: ratio >= 1 - tolerance ? 'RATE-HOLD PASS' : 'RATE-HOLD FAIL',
    publishable: true,
    holdRatio: +ratio.toFixed(4),
    lostPercent: +((1 - ratio) * 100).toFixed(1),
    unit: 'market-seconds delivered per wall-second',
    baselineMarketSecPerWallSec: +b.toFixed(3),
    finalMarketSecPerWallSec: +f.toFixed(3),
    // Derived display, and null when the denominator is unknown rather than guessed.
    baselineBarsPerSec: denominators.size === 1 ? +(b / [...denominators][0]).toFixed(4) : (assumeDenominatorSec ? +(b / assumeDenominatorSec).toFixed(4) : null),
    finalBarsPerSec: denominators.size === 1 ? +(f / [...denominators][0]).toFixed(4) : (assumeDenominatorSec ? +(f / assumeDenominatorSec).toFixed(4) : null),
    rateUnitsSeen: [...new Set(usable.map((s) => s.rateUnit))],
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
