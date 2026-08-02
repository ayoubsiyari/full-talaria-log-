/**
 * B review probe for E's forming-renderer A8 row — the missing discriminating cell.
 *
 * WHY THIS EXISTS
 *   `forming-renderer-step-clock.test.mjs` is 6/6 and every cell in it is
 *   `assert.match(source, /regex/)` against lifted method text. It proves the
 *   code is present and shaped a certain way. It never executes the product, so
 *   it cannot go red on a `_deriveStepClockFormingCandle` that returns wrong
 *   numbers — which is the whole point of the row. That left PROC-3's
 *   discriminating axis open on E-FORMING-A8, the last non-canary red.
 *
 *   Presence is not binding and binding is not correctness. This runs the
 *   helper.
 *
 * WHAT IT HOLDS DOWN
 *   1. the forming price genuinely advances with the step clock
 *   2. the path it walks actually varies              (anti-vacuity for cell 1)
 *   3. a completed bar lands exactly on the real close
 *   4. the forming price never escapes the bar's own high/low
 *   5. a step-clock-blind mutant FAILS cell 1         (the discriminating proof)
 *
 * Cell 5 is the one that closes the axis. Cells 1-4 could all be satisfied by
 * an implementation that ignores the clock if the fixture were kind enough, so
 * the probe rebuilds the helper with its step-clock read frozen and requires
 * that the frozen version breaks. If the mutant passes, cell 1 was not
 * discriminating and this probe says so rather than reporting green.
 *
 * A mutant whose text anchor did not apply is reported as its own distinct
 * failure, not folded in with "mutant survived" — a broken anchor and a
 * non-discriminating cell are different diagnoses and must not look alike.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

globalThis.window = globalThis.window || {};
const ReplaySystem = require(path.join(ROOT, 'chart v 1.4/chart/modules/replay-system.js'));

const TICKS = 24;
const BAR = { t: 1730000000000, o: 100, h: 112, l: 92, c: 104, v: 1000 };

function makeReplay() {
  const replay = Object.create(ReplaySystem.prototype);
  replay.chart = { currentSymbol: 'EURUSD' };
  replay.ticksPerCandle = TICKS;
  replay.currentTicksPerCandle = TICKS;
  replay.tickProgress = 0;
  return replay;
}

function makeTarget() {
  return {
    target: BAR,
    t: BAR.t,
    open: BAR.o,
    high: BAR.o,
    low: BAR.o,
    close: BAR.o,
    targetVolume: BAR.v,
    cachedPath: null,
  };
}

/** Walk the clock and snapshot each price. The helper returns reused scratch,
 *  so reading `.c` later instead of now would sample the same object N times. */
function walk(replay, helper, target) {
  const out = [];
  for (let p = 0; p <= TICKS; p++) {
    replay.tickProgress = p;
    const forming = helper.call(replay, target, TICKS);
    out.push(forming ? forming.c : null);
  }
  return out;
}

let failures = 0;
function cell(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  if (!ok) failures++;
}

console.log('\n=== E forming-renderer A8 — executing step-clock contract ===');

const real = ReplaySystem.prototype._deriveStepClockFormingCandle;
const replay = makeReplay();
const target = makeTarget();
const series = walk(replay, real, target);
const distinct = new Set(series.map((v) => (v === null ? 'null' : v.toFixed(6))));

console.log(`  sampled ${series.length} clock positions, ${distinct.size} distinct prices`);
console.log(`  first: ${series[0]}   mid: ${series[Math.floor(TICKS / 2)]}   last: ${series[TICKS]}`);

cell(
  distinct.size > 1,
  'the forming price advances with the step clock',
  distinct.size > 1
    ? `${distinct.size} distinct prices across the bar`
    : 'the helper returned the same price at every clock position — it is not reading the clock',
);

{
  const p = makeReplay().getRetainedTickPath(BAR, 'probe');
  const varied = new Set(Array.prototype.map.call(p, (v) => Number(v).toFixed(6))).size > 1;
  cell(
    varied,
    'the underlying path genuinely varies (anti-vacuity control for cell 1)',
    varied ? 'the path has real movement, so a clock-blind helper is observable'
           : 'PROBE IS VACUOUS: the path is flat, so cell 1 cannot distinguish anything.',
  );
}

cell(
  series[TICKS] === BAR.c,
  'a completed bar lands exactly on the real close',
  series[TICKS] === BAR.c ? `closes on ${BAR.c}` : `expected ${BAR.c}, got ${series[TICKS]}`,
);

{
  const escaped = series.filter((v) => v !== null && (v < BAR.l || v > BAR.h));
  cell(
    escaped.length === 0,
    "the forming price never escapes the bar's own high/low",
    escaped.length ? `${escaped.length} sample(s) outside [${BAR.l}, ${BAR.h}]: ${escaped.slice(0, 3).join(', ')}`
                   : `all samples inside [${BAR.l}, ${BAR.h}]`,
  );
}

// ---- cell 5: the discriminating proof -------------------------------------
{
  const ANCHOR = 'Number(this.tickProgress) || 0';
  const src = real.toString();
  if (!src.includes(ANCHOR)) {
    cell(false, 'MUTANT ANCHOR BROKEN — this is not a verdict on the product',
      `could not find ${ANCHOR} in the helper. The mutant did not apply, so cell 5 proved nothing. Re-anchor the probe; do not read this as the product passing or failing.`);
  } else {
    const mutantSrc = src.replace(ANCHOR, '0');
    const mutant = new Function(`return function ${mutantSrc.replace(/^_deriveStepClockFormingCandle/, '')}`)();
    const mSeries = walk(makeReplay(), mutant, makeTarget());
    const mDistinct = new Set(mSeries.map((v) => (v === null ? 'null' : v.toFixed(6))));
    cell(
      mDistinct.size === 1,
      'a step-clock-blind mutant FAILS cell 1 (discriminating proof)',
      mDistinct.size === 1
        ? `frozen-clock mutant collapses to a single price (${mSeries[0]}), so cell 1 is discriminating`
        : `mutant still produced ${mDistinct.size} distinct prices — cell 1 does NOT discriminate and the axis stays open`,
    );
  }
}

console.log(`\n  ${failures === 0 ? 'A8 DISCRIMINATING AXIS CLOSED' : `${failures} finding(s)`}`);
process.exitCode = failures === 0 ? 0 : 1;
