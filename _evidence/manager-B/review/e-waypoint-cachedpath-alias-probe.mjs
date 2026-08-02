/**
 * B review probe for E's deterministic-waypoint row (7fdf71e5a).
 *
 * WHAT PROMPTED IT
 *   The row makes `generatePath` write into one reused per-panel array, and E's
 *   own gate asserts that: `generatePath must return the reused per-panel path
 *   scratch`. As an allocation cut that is exactly right. But `getTickPath`
 *   hands that same array to callers, and five call sites in replay-system.js
 *   do not consume it and drop it — they RETAIN it on a candle:
 *
 *     const prePath = this.getTickPath(targetCandle);   ... cachedPath: prePath
 *     target.cachedPath = this.getTickPath(tc);
 *     this.animatingCandle.cachedPath = this.getTickPath(...)
 *     if (!anim.cachedPath) anim.cachedPath = path;
 *     const tickPath = this.getTickPath(nextCandle);    ... cachedPath: tickPath
 *
 *   A retained alias of a shared buffer is only safe while nothing else calls
 *   the generator. The last one prefetches the NEXT candle's path, which is a
 *   call that happens while the current candle is still animating.
 *
 *   `_deriveStepClockFormingCandle` then reads `target.cachedPath[pathIndex]`
 *   on every tick for the whole candle, so if the buffer moved underneath, the
 *   forming candle interpolates along the wrong bar's path.
 *
 * WHAT THIS DOES NOT CLAIM
 *   It does not claim a user-visible break. It answers one narrow question with
 *   an observation instead of a reading: does a retained path change when a
 *   second path is generated? Cell 2 is the anti-vacuity control — if the two
 *   candles produced identical paths anyway, cell 1 would pass for the wrong
 *   reason and prove nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const REPLAY = path.join(ROOT, 'chart v 1.4/chart/modules/replay-system.js');

globalThis.window = globalThis.window || {};
const ReplaySystem = require(REPLAY);

function makeReplay(symbol = 'EURUSD') {
  const replay = Object.create(ReplaySystem.prototype);
  replay.chart = { currentSymbol: symbol };
  replay.ticksPerCandle = 25;
  return replay;
}

const candleA = { symbol: 'EURUSD', t: 1730000000000, o: 100, h: 106, l: 94, c: 101 };
const candleB = { symbol: 'EURUSD', t: 1730000060000, o: 200, h: 240, l: 180, c: 220 };

let failures = 0;
function cell(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  if (!ok) failures++;
}

console.log('\n=== E waypoint row — retained cachedPath aliasing probe ===');

const replay = makeReplay();
const retained = replay.getTickPath(candleA);          // the `target.cachedPath = ...` move
const snapshot = Array.prototype.slice.call(retained); // what the caller believes it holds
const second = replay.getTickPath(candleB);            // e.g. the next-candle prefetch

const sameObject = retained === second;
const mutated = JSON.stringify(snapshot) !== JSON.stringify(Array.prototype.slice.call(retained));

console.log(`  retained path first 4 values, as generated: ${snapshot.slice(0, 4).join(', ')}`);
console.log(`  retained path first 4 values, after a second generate: ${Array.prototype.slice.call(retained).slice(0, 4).join(', ')}`);
console.log(`  getTickPath returned the same array object both times: ${sameObject}`);

cell(
  !mutated,
  'a retained cachedPath survives a second getTickPath call',
  mutated
    ? 'REPRODUCED: the retained array was rewritten in place. Any candle holding it as cachedPath is now interpolating along a different bar\'s path.'
    : 'the retained array kept its values',
);

// Anti-vacuity: the two candles must genuinely produce different paths, or cell
// 1 could pass simply because there was nothing to notice.
const pathBValues = Array.prototype.slice.call(second);
cell(
  JSON.stringify(snapshot) !== JSON.stringify(pathBValues),
  'the two candles produce different paths (anti-vacuity control)',
  JSON.stringify(snapshot) === JSON.stringify(pathBValues)
    ? 'PROBE IS VACUOUS: both candles generated the same path, so cell 1 cannot distinguish aliasing from coincidence.'
    : 'the second candle generates a visibly different path, so a clobber is observable',
);

console.log(`\n  ${failures === 0 ? 'NO FINDING' : `${failures} finding(s)`}`);
process.exitCode = failures === 0 ? 0 : 1;
