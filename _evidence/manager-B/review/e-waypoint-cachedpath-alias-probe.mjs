/**
 * B review probe for E's deterministic-waypoint row — now a regression gate.
 *
 * HISTORY, BECAUSE THE CONTRACT MOVED UNDER IT
 *   First version of this file reproduced a live defect: `getTickPath` returned
 *   one reused per-panel array, five call sites retained it on a candle as
 *   `cachedPath`, and generating a path for any second bar rewrote the retained
 *   one in place (~100 became ~200). E fixed it in `f3ecb494f` by splitting the
 *   two uses apart — `getTickPath` still returns the shared scratch for
 *   TRANSIENT readers, and `getRetainedTickPath(candle, slot)` hands a
 *   long-lived per-slot buffer to callers that keep the array.
 *
 *   That makes the original cell obsolete rather than passing: retaining the
 *   output of plain `getTickPath` is now a caller error by contract, so a probe
 *   that did it would be asserting against an API nobody is supposed to use. It
 *   is rewritten to test the contract that now exists.
 *
 * WHAT IT HOLDS DOWN
 *   1. a retained slot buffer survives transient traffic          (the original bug)
 *   2. two different slots do not alias each other
 *   3. the two bars really do produce different paths             (anti-vacuity)
 *   4. no retain site has quietly gone back to the shared scratch (static sweep)
 *
 * Cell 3 is not decoration. Cells 1 and 2 both pass trivially if the generator
 * happens to emit the same numbers for both bars, so without it a green here
 * would mean nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const REPLAY = path.join(ROOT, 'chart v 1.4/chart/modules/replay-system.js');
const REPLAY_MIRROR = path.join(ROOT, 'homepage/public/chart/modules/replay-system.js');

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
const snap = (a) => Array.prototype.slice.call(a);

let failures = 0;
function cell(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  if (!ok) failures++;
}

console.log('\n=== E waypoint row — retained path slot contract ===');

// 1. The original defect, expressed against the new API.
{
  const replay = makeReplay();
  const retained = replay.getRetainedTickPath(candleA, 'animatingCandle');
  const before = snap(retained);
  replay.getTickPath(candleB);                 // ordinary transient reader
  const after = snap(retained);
  console.log(`  retained slot, before transient traffic: ${before.slice(0, 3).join(', ')}`);
  console.log(`  retained slot, after transient traffic:  ${after.slice(0, 3).join(', ')}`);
  cell(
    JSON.stringify(before) === JSON.stringify(after),
    'a retained slot buffer survives a transient getTickPath call',
    JSON.stringify(before) === JSON.stringify(after)
      ? 'the retained path is untouched by transient traffic'
      : 'REGRESSION: the retained buffer was rewritten in place — this is the f3ecb494f defect returning',
  );
}

// 2. Slots must be independent of each other, not just of the scratch.
{
  const replay = makeReplay();
  const anim = replay.getRetainedTickPath(candleA, 'animatingCandle');
  const before = snap(anim);
  replay.getRetainedTickPath(candleB, 'savedTickState');
  cell(
    JSON.stringify(before) === JSON.stringify(snap(anim)),
    'two named slots do not alias each other',
    JSON.stringify(before) === JSON.stringify(snap(anim))
      ? 'slots are independent buffers'
      : 'REGRESSION: one slot is writing into another slot\'s buffer',
  );
}

// 3. Anti-vacuity. Without this, cells 1 and 2 pass on identical output.
{
  const replay = makeReplay();
  const a = snap(replay.getRetainedTickPath(candleA, 'x'));
  const b = snap(replay.getRetainedTickPath(candleB, 'y'));
  cell(
    JSON.stringify(a) !== JSON.stringify(b),
    'the two bars produce different paths (anti-vacuity control)',
    JSON.stringify(a) === JSON.stringify(b)
      ? 'PROBE IS VACUOUS: both bars generate the same path, so cells 1 and 2 cannot see a clobber.'
      : 'the bars differ, so a clobber would be visible',
  );
}

// 4. A retain site that drifts back to the shared scratch reintroduces the bug
//    silently, and cells 1-3 would not notice because they call the API directly.
{
  for (const [label, file] of [['canonical', REPLAY], ['mirror', REPLAY_MIRROR]]) {
    const src = fs.readFileSync(file, 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /cachedPath\s*[:=]\s*(this\.)?getTickPath\s*\(/.test(line)
        || /cachedPath\s*[:=]\s*this\.getTickPath\b/.test(line));
    cell(
      offenders.length === 0,
      `${label}: no retain site takes the shared scratch`,
      offenders.length ? offenders.map((o) => `L${o.n}: ${o.line}`).join('\n        ') : 'all retain sites go through getRetainedTickPath',
    );
  }
}

console.log(`\n  ${failures === 0 ? 'CONTRACT HOLDS' : `${failures} finding(s)`}`);
process.exitCode = failures === 0 ? 0 : 1;
