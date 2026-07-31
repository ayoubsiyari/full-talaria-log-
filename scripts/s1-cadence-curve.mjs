#!/usr/bin/env node
/**
 * S1-CADENCE-CURVE — item 1's second half: where does delivery depart from intent?
 *
 * Intent is not a guess here. It is computed from the shipped formula in
 * `replay-system.js:getCandlePlaybackCadence`:
 *
 *   intervalMs   = max(16, floor(1000 / speed))
 *   stepsPerTick = max(1, round(speed * intervalMs / 1000))
 *   intended candles/sec = stepsPerTick * 1000 / intervalMs
 *
 * So the comparison is against the engine's own arithmetic rather than against an assumed real-time
 * multiple, which is the mistake that produced the "14x" in the first place.
 *
 * FIT-01: a saturation curve is not linear, so this reports the shape and the knee rather than fitting
 * a line through it and quoting an rSquared.
 */
import fs from 'node:fs';

const IN = process.env.C_S1 || 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SWEEP-S1-20260731.json';
const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\S1-CADENCE-CURVE-20260731.json';

/** The shipped formula, transcribed. MIN_INTERVAL_MS is 16 in the source. */
export function intendedCadence(speed) {
  const s = Math.max(1, Number(speed) || 1);
  const intervalMs = Math.max(16, Math.floor(1000 / s));
  const stepsPerTick = Math.max(1, Math.round((s * intervalMs) / 1000));
  return {
    intervalMs,
    stepsPerTick,
    candlesPerSec: +((stepsPerTick * 1000) / intervalMs).toFixed(3),
  };
}

const mean = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const art = JSON.parse(fs.readFileSync(IN, 'utf8'));
const points = (art.points || []).filter((p) => Array.isArray(p.samples) && p.samples.length);
// A curve with a hole in it must say where the hole is, especially when the hole is near the knee.
const missing = (art.points || [])
  .filter((p) => !(Array.isArray(p.samples) && p.samples.length))
  .map((p) => ({ selectedSpeed: Number(p.value), status: p.status, reason: p.reason || null }));

const rows = points.map((p) => {
  const speed = Number(p.value);
  const want = intendedCadence(speed);
  // Use the second half of each point's samples: the first minutes include boot transients and the
  // engine warming up, which would drag a mean toward a rate the point did not sustain.
  const half = p.samples.slice(Math.floor(p.samples.length / 2));
  const bps = half.map((s) => s.derived?.barsPerSec ?? s.barsPerSec).filter((v) => Number.isFinite(v));
  const cpu = half.map((s) => s.cpu?.rendererCpuPercent).filter((v) => Number.isFinite(v));
  const msBar = half.map((s) => s.derived?.cpuMsPerBar ?? s.cpuMsPerBar).filter((v) => Number.isFinite(v));
  const paints = half.map((s) => s.derived?.paintsPerSec ?? s.paintsPerSec).filter((v) => Number.isFinite(v));
  const delivered = median(bps);
  return {
    selectedSpeed: speed,
    status: p.status,
    samplesUsed: bps.length,
    intendedIntervalMs: want.intervalMs,
    intendedStepsPerTick: want.stepsPerTick,
    intendedCandlesPerSec: want.candlesPerSec,
    deliveredCandlesPerSecMedian: delivered != null ? +delivered.toFixed(2) : null,
    deliveredOverIntended: (delivered != null && want.candlesPerSec > 0)
      ? +(delivered / want.candlesPerSec).toFixed(3) : null,
    rendererCpuPercentMedian: cpu.length ? +median(cpu).toFixed(1) : null,
    cpuMsPerBarMedian: msBar.length ? +median(msBar).toFixed(2) : null,
    paintsPerSecMedian: paints.length ? +median(paints).toFixed(1) : null,
    // On a 1-minute chart one candle per second is sixty times real time. This is the number a user
    // would think the control was showing them.
    realTimeMultipleOn1mChart: delivered != null ? Math.round(delivered * 60) : null,
    intendedRealTimeMultipleOn1mChart: Math.round(want.candlesPerSec * 60),
  };
}).sort((a, b) => a.selectedSpeed - b.selectedSpeed);

const report = {
  signature: 'S1-CADENCE-CURVE-V1',
  ruling: 'cbfdb81f4 item 1',
  source: IN,
  intentSource: 'replay-system.js getCandlePlaybackCadence, transcribed: intervalMs = max(16, floor(1000/speed)); stepsPerTick = max(1, round(speed*intervalMs/1000))',
  intentCaveat: 'The finest-timeframe sub-step path can raise stepsPerTick further when active, which would RAISE intended cadence and therefore WIDEN any shortfall. The figures below are the conservative floor on intent.',
  configuration: {
    panels: 4,
    indicatorsPerChart: 2,
    chartTimeframeOfHost: '1m',
    note: 'UNIT-01: this curve is measured with two indicators per chart, which is the acceptance configuration. Delivery at zero indicators is higher - S3 measured 26.78 candles/s at selected 60x - so the shortfall below is not the best case.',
  },
  rows,
  missingPoints: missing,
  missingPointsNote: missing.length
    ? `${missing.length} point(s) produced no samples: ${missing.map((m) => `${m.selectedSpeed}x (${m.reason || m.status})`).join('; ')}. The knee can only be bracketed between measured neighbours, not located, wherever a gap falls between them.`
    : null,
};

// ---- Where does it break away from intent? --------------------------------
const usable = rows.filter((r) => r.deliveredOverIntended != null);
if (usable.length >= 2) {
  const tracking = usable.filter((r) => r.deliveredOverIntended >= 0.9);
  const failing = usable.filter((r) => r.deliveredOverIntended < 0.9);
  const lastGood = tracking.length ? tracking[tracking.length - 1] : null;
  const firstBad = failing.length ? failing[0] : null;
  const ceiling = Math.max(...usable.map((r) => r.deliveredCandlesPerSecMedian));
  const atCeiling = usable.find((r) => r.deliveredCandlesPerSecMedian === ceiling);
  // If a VOID point sits between the last tracking speed and the first failing one, the knee is
  // bracketed rather than located, and the bracket must be quoted instead of a single number.
  const gapInBracket = lastGood && firstBad
    ? missing.filter((m) => m.selectedSpeed > lastGood.selectedSpeed && m.selectedSpeed < firstBad.selectedSpeed)
    : [];
  report.knee = {
    tracksIntentUpToSpeed: lastGood ? lastGood.selectedSpeed : null,
    firstSpeedThatFallsShort: firstBad ? firstBad.selectedSpeed : null,
    kneeBracket: (lastGood && firstBad) ? [lastGood.selectedSpeed, firstBad.selectedSpeed] : null,
    kneeBracketWidenedByVoidPoints: gapInBracket.length
      ? `${gapInBracket.map((m) => `${m.selectedSpeed}x`).join(', ')} was VOID, so the knee is only bracketed to (${lastGood.selectedSpeed}x, ${firstBad.selectedSpeed}x] and is not located within it`
      : null,
    deliveredCeilingCandlesPerSec: +ceiling.toFixed(2),
    ceilingReachedAtSpeed: atCeiling ? atCeiling.selectedSpeed : null,
    pointsAboveTheKnee: failing.length,
    shape: (() => {
      const d = usable.map((r) => r.deliveredCandlesPerSecMedian);
      const monotonic = d.every((v, i) => i === 0 || v >= d[i - 1] * 0.95);
      if (monotonic && failing.length >= 2) return 'SATURATING — delivery rises with the setting, then flattens against a ceiling';
      if (monotonic && failing.length === 1) return 'FALLS SHORT ABOVE THE KNEE — delivery still rises but no longer keeps up; one point above the knee cannot distinguish a ceiling from a slower-but-still-rising regime';
      if (monotonic) return 'TRACKING — delivery follows the setting across the whole range measured';
      return 'NON-MONOTONIC — delivery does not rise consistently with the setting, which needs explaining before the curve is quoted';
    })(),
    // FIT-01: a saturation curve fitted with a line would report a high rSquared and a meaningless
    // slope, so the residual statement here is the shape itself plus the knee location.
    fit01Note: 'No linear fit is published for this curve. A straight line through a saturating relationship yields a high rSquared and a slope that describes neither regime; the reportable facts are the tracking range, the knee and the ceiling.',
  };
  // Only claim a plateau if more than one point sits above the knee. One point above it establishes a
  // shortfall, not a ceiling that later settings share.
  const plateauClaimable = failing.length >= 2;
  report.verdict = firstBad
    ? `The engine tracks its own intended cadence up to selected ${lastGood ? lastGood.selectedSpeed : '?'}x and falls short from ${firstBad.selectedSpeed}x, where it delivers ${firstBad.deliveredOverIntended} of what it asks itself for.`
      + (plateauClaimable
        ? ` Delivery flattens at about ${report.knee.deliveredCeilingCandlesPerSec} candles/s across ${failing.length} settings, so the control stops making a difference past the knee.`
        : ` With only one measured point above the knee this is a shortfall, NOT yet a demonstrated ceiling — whether higher settings deliver the same, more or less is unmeasured here.`)
    : `The engine tracks its intended cadence across every speed measured (worst ratio ${Math.min(...usable.map((r) => r.deliveredOverIntended))}). No ceiling was reached in this range.`;
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

console.error(`\n=== S1 CADENCE CURVE (${rows.length} points, ${usable.length} usable) ===`);
console.error('  sel   intended  delivered   ratio    rendererCPU%   ms/bar   real-time multiple on a 1m chart');
for (const r of rows) {
  console.error(`  ${String(r.selectedSpeed).padStart(3)}x  ${String(r.intendedCandlesPerSec).padStart(8)}  ${String(r.deliveredCandlesPerSecMedian ?? 'n/a').padStart(9)}  ${String(r.deliveredOverIntended ?? 'n/a').padStart(6)}  ${String(r.rendererCpuPercentMedian ?? 'n/a').padStart(12)}  ${String(r.cpuMsPerBarMedian ?? 'n/a').padStart(8)}   intended ${r.intendedRealTimeMultipleOn1mChart}x, got ${r.realTimeMultipleOn1mChart ?? 'n/a'}x`);
}
if (report.knee) {
  console.error(`\nshape: ${report.knee.shape}`);
  console.error(`${report.verdict}`);
}
console.error(`\nartifact ${OUT}`);
