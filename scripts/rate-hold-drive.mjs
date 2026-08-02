#!/usr/bin/env node
/**
 * Drive RATE-HOLD against synthetic series with known answers, before it judges a real build.
 *
 * The point is not that it returns a number. It is that it returns the RIGHT number on a build that
 * decays, refuses to answer when it cannot, and is not fooled by the warm-up transient that every honest
 * session has. An oracle that passes everything is decoration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { evaluateRateHold, deliveredRate } from './lib/rate-hold.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

// A session that warms up fast then holds. Warm-up is REAL and must not be read as decay.
const holding = [];
for (let i = 0; i <= 120; i++) {
  const h = i * (10 / 120);
  const warm = h < 0.05 ? 20.6 - (h / 0.05) * 10.4 : 10.2;   // 20.6 -> 10.2 inside the first 3 min
  holding.push({ hours: h, marketSecPerWallSec: (warm + (i % 3) * 0.02) * 60, barsPerSec: warm + (i % 3) * 0.02, barsPerSecDenominatorSec: 60, speed: 60 });
}

/**
 * Fixtures set BOTH fields from one figure, via a helper.
 *
 * The first version of these mutated only bars/s, which is now derived display - so the judge read the
 * untouched primary and scored a series built to lose half its delivery as "0% lost, ratio 1". The
 * library now refuses that disagreement outright; these are written so the disagreement cannot arise.
 */
const atRate = (s, barsPerSec) => ({ ...s, barsPerSec, marketSecPerWallSec: barsPerSec * s.barsPerSecDenominatorSec });

// The complaint: delivery halves over ten hours.
const decaying = holding.map((s) => (s.hours < 0.05 ? s : atRate(s, 10.2 * (1 - 0.5 * (s.hours / 10)))));

// The catastrophe the PO's numbers hint at: nominal collapsing to ~1.7 bars/s.
const collapsing = holding.map((s) => (s.hours < 0.05 ? s : atRate(s, Math.max(1.74, 10.2 * Math.exp(-s.hours / 2)))));

{
  const r = evaluateRateHold(holding);
  check('a session that warms up and then HOLDS passes',
    r.verdict === 'RATE-HOLD PASS' && r.holdRatio >= 0.95, `ratio ${r.holdRatio}`);
  check('the warm-up transient does NOT count as decay (settled baseline, not t=0)',
    r.baselineBarsPerSec > 9.5 && r.baselineBarsPerSec < 11, `baseline ${r.baselineBarsPerSec} bars/s, not the 20.6 opening`);
  check('the naive t=0 ratio is published so the baseline choice is auditable',
    r.naiveFirstSampleRatio != null && r.naiveFirstSampleRatio < 0.6, `naive ${r.naiveFirstSampleRatio} vs settled ${r.holdRatio}`);
}
{
  const r = evaluateRateHold(decaying);
  check('a build that loses half its delivery FAILS',
    r.verdict === 'RATE-HOLD FAIL' && r.lostPercent > 40, `${r.lostPercent}% lost, ratio ${r.holdRatio}`);
}
{
  const r = evaluateRateHold(collapsing);
  check('a 60x session collapsing toward 1.74 bars/s FAILS loudly',
    r.verdict === 'RATE-HOLD FAIL' && r.holdRatio < 0.25, `ratio ${r.holdRatio}, final ${r.finalBarsPerSec} bars/s`);
}
{
  // 5% is the bar: 4% lost must pass, 6% lost must fail, or the threshold is decorative.
  const near = (loss) => holding.map((s) => (s.hours < 0.05 ? s : atRate(s, 10.2 * (s.hours > 5 ? 1 - loss : 1))));
  const a = evaluateRateHold(near(0.04));
  const b = evaluateRateHold(near(0.06));
  check('the 5% bar discriminates: 4% lost passes, 6% lost fails',
    a.verdict === 'RATE-HOLD PASS' && b.verdict === 'RATE-HOLD FAIL', `4% -> ${a.holdRatio}, 6% -> ${b.holdRatio}`);
}
{
  const r = evaluateRateHold(holding.map((s) => ({ ...s, speed: s.hours > 5 ? 30 : 60 })));
  check('a speed change mid-run VOIDS rather than comparing two experiments',
    r.verdict === 'VOID' && /speed changed/.test(r.why), r.why?.slice(0, 60));
}
{
  const r = evaluateRateHold(holding.slice(0, 4));
  check('too few samples VOIDS instead of quietly passing',
    r.verdict === 'VOID' && r.publishable === false, r.why?.slice(0, 60));
}
{
  // A run that never left warm-up has no settled baseline to judge against.
  const r = evaluateRateHold(holding.filter((s) => s.hours < 0.04));
  check('a run with no settled baseline window VOIDS',
    r.verdict === 'VOID', r.why?.slice(0, 70));
}
{
  // Delivery is measured on the continuous playhead; a re-seek is not delivery.
  const fwd = deliveredRate({ atMs: 0, replayTimestamp: 0, replayIndex: 0 }, { atMs: 10000, replayTimestamp: 600000, replayIndex: 10 });
  check('delivered rate reads the simulated clock (10 x 1m bars in 10 s = 1 bar/s)',
    fwd.ok && Math.abs(fwd.barsPerSec - 1) < 0.001 && fwd.route === 'simulated-time', `${fwd.barsPerSec} bars/s via ${fwd.route}`);
  const back = deliveredRate({ atMs: 0, replayTimestamp: 600000, replayIndex: 10 }, { atMs: 10000, replayTimestamp: 0, replayIndex: 0 });
  check('a backwards playhead is refused, not averaged in as negative delivery',
    back.ok === false && /backwards/.test(back.why), back.why);
  const stalled = deliveredRate({ atMs: 0, replayTimestamp: 600000, replayIndex: 10 }, { atMs: 10000, replayTimestamp: 600000, replayIndex: 10 });
  check('a stalled playhead reads 0 bars/s rather than failing to read',
    stalled.ok && stalled.barsPerSec === 0, `${stalled.barsPerSec} bars/s`);
}

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(path.join(EV, 'RATE-HOLD-DRIVE.json'), JSON.stringify({
  signature: 'RATE-HOLD-DRIVE-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — synthetic series, no browser.',
  whatThisProves: 'The RATE-HOLD oracle discriminates a holding build from a decaying one, respects the 5% bar in both directions, is not fooled by the warm-up transient, and VOIDs rather than passing when it cannot judge.',
  passed, total: results.length, results,
}, null, 1));
console.log(`\n${passed}/${results.length} passed`);
process.exitCode = passed === results.length ? 0 : 1;
