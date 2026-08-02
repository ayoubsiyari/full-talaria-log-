/**
 * B review probe for E's forming-renderer A8 row — FINDING 1.
 *
 * CLAIM UNDER TEST
 *   After A8, `__TALARIA_DISABLE_MC_MIRROR_PAINT_COALESCE_V1` no longer changes
 *   anything on the mirror paint path *while replay is playing*, because
 *   `_finishMultichartMirrorRender` now takes the whole branch on
 *   `shouldUseDirtyPaint = passivePlay || lightPass || this.isPlaying`, leaving
 *   `_mcMirrorPaintCoalesceDisabled()` in an `else if` that cannot be reached.
 *
 * WHY A PROBE AND NOT A READING
 *   BIND-01: presence is not binding and binding is not correctness. Saying "the
 *   branch looks unreachable" is a reading. This lifts the real product method
 *   out of the shipped file and runs it, so the finding is an observation.
 *
 * WHAT WOULD MAKE THIS PROBE WORTHLESS
 *   A probe that cannot see a *working* switch would report "inert" for a switch
 *   that is fine, which is the vacuous-green shape we keep getting bitten by. So
 *   cell 2 runs the identical comparison with `isPlaying = false`, where the
 *   switch is still wired, and REQUIRES the two arms to differ. If cell 2 ever
 *   goes quiet, cell 1's red means nothing and this file is lying.
 *
 * Exits non-zero if the finding does not reproduce, or if the probe is vacuous.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'chart v 1.4/chart/modules/replay-system.js');
const METHOD = '_finishMultichartMirrorRender';

const source = fs.readFileSync(SRC, 'utf8');

/** Lift a class method out of the product file by brace matching. */
function extractMethod(text, name) {
  const start = text.indexOf(`\n    ${name}(`);
  if (start < 0) throw new Error(`method ${name} not found in ${SRC}`);
  const open = text.indexOf('{', text.indexOf('(', start));
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start + 1, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const methodText = extractMethod(source, METHOD);
const body = methodText.slice(methodText.indexOf('{'));

// The lifted method closes over exactly one module-level helper we care about,
// so it is injected rather than stubbed on `this` — the probe must exercise the
// real call site, not a lookalike.
const makeMethod = (switchDisabled) => new Function(
  '_mcMirrorPaintCoalesceDisabled',
  `return function (chart, opts) ${body};`,
)(() => switchDisabled);

/**
 * Empty `chart.data` short-circuits the viewport block above the paint tail, so
 * the only live input to `shouldUseDirtyPaint` is `isPlaying`. Every paint route
 * the tail can take is recorded rather than asserted one at a time.
 */
function run({ isPlaying, switchDisabled }) {
  const seen = { render: 0, requestRafPaint: 0, scheduleRender: 0 };
  const chart = {
    data: [],
    isLoading: true,
    offsetX: 0,
    candleWidth: 6,
    _multichartPassivePlayActive: false,
    render() { seen.render++; },
    _requestRafPaint() { seen.requestRafPaint++; },
    scheduleRender() { seen.scheduleRender++; },
    renderPending: null,
  };
  const self = {
    isPlaying,
    tickProgress: 3,
    autoScrollEnabled: true,
    userHasPanned: false,
    _scheduleReplayIndicatorRecalc() {},
    _replayUserOwnsViewport: () => false,
  };
  makeMethod(switchDisabled).call(self, chart, {});
  return { ...seen, renderPending: chart.renderPending };
}

const fmt = (o) => `render=${o.render} rafPaint=${o.requestRafPaint} scheduleRender=${o.scheduleRender} renderPending=${o.renderPending}`;

let failures = 0;
function cell(ok, label, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  if (!ok) failures++;
}

console.log(`\n=== E forming-renderer A8 — mirror paint kill-switch probe ===`);
console.log(`  product file: chart v 1.4/chart/modules/replay-system.js`);
console.log(`  lifted method: ${METHOD}\n`);

// ---- cell 1: the finding. While playing, the switch must change SOMETHING. ----
const playOn = run({ isPlaying: true, switchDisabled: true });
const playOff = run({ isPlaying: true, switchDisabled: false });
console.log(`  while PLAYING, switch set (legacy asked for): ${fmt(playOn)}`);
console.log(`  while PLAYING, switch clear (new behaviour):   ${fmt(playOff)}`);
const inertWhilePlaying = JSON.stringify(playOn) === JSON.stringify(playOff);
cell(
  !inertWhilePlaying,
  'MC_MIRROR_PAINT_COALESCE still has authority while replay is playing',
  inertWhilePlaying
    ? 'REPRODUCED: both arms are byte-identical. Flipping the documented switch during a replay changes nothing — it is inert exactly where paint cost matters.'
    : 'the two arms differ, so the switch still bites while playing',
);

// ---- cell 2: anti-vacuity. The probe must be able to SEE a working switch. ----
const idleOn = run({ isPlaying: false, switchDisabled: true });
const idleOff = run({ isPlaying: false, switchDisabled: false });
console.log(`\n  while IDLE, switch set:   ${fmt(idleOn)}`);
console.log(`  while IDLE, switch clear: ${fmt(idleOff)}`);
cell(
  JSON.stringify(idleOn) !== JSON.stringify(idleOff),
  'probe can detect a working switch (anti-vacuity control)',
  JSON.stringify(idleOn) === JSON.stringify(idleOff)
    ? 'PROBE IS VACUOUS: the switch does not bite when idle either, so cell 1 proves nothing. Do not quote cell 1 until this passes.'
    : 'idle arms differ, so a live switch is observable through these outputs',
);

console.log(`\n  ${failures === 0 ? 'NO FINDING' : `${failures} finding(s)`} — cell 1 red means the contract defect reproduces.`);
process.exitCode = failures === 0 ? 0 : 1;
