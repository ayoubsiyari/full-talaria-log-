/**
 * Executes the rehearsal's grading block against synthetic artifacts, launching nothing.
 *
 * This exists because of a defect class, not a feature: the grading block only ever ran at the end of a
 * real soak, so an unresolved identifier in it was invisible until the machine time was already spent.
 * B's shakedown found `args is not defined` that way; I wrote a `notes is not defined` into the same
 * block an hour later. `node --check` passes both. Running the block is the only thing that does not.
 *
 * Two fixtures, and the second is the point:
 *   healthy   — four panels live from the start.
 *   warm-up   — livePanels 0,0,2 before settling to 4, which is the shape B observed. Delivery in those
 *               early samples is HIGH (a chart with no live panels is not doing the workload), so a
 *               baseline anchored there would make a decaying run look like it held.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateRateHold } from './lib/rate-hold.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b122-grade-'));
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

function sample(n, hours, { livePanels, rate }) {
  return {
    n, hours, segment: 1, residentBars: 2000 + n * 50,
    livePanels, panelsLive: livePanels,
    marketSecPerWallSec: rate, deliveredBarsPerSec: rate / 60, barsPerSecDenominatorSec: 60,
    hostFramesPerSec: 30, barsPerFrame: 0.3, speed: 10,
    sealHeld: true, sourceCommitHeld: true, capabilityHeld: true,
    panelRates: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, tf: '1m', marketSecPerWallSec: i < livePanels ? rate / 4 : 0, barsPerSec: 0 })),
  };
}

function writeFixture(name, samples) {
  const file = path.join(tmp, `${name}.jsonl`);
  const rows = [
    { __segmentStart: true, segment: 1, requestedSpeed: 10, effectiveSpeed: 10, effectiveSpeedRoute: 'getTargetBarsPerSecond()' },
    ...samples,
  ];
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
}

// ---- 1. the grading block executes at all -------------------------------------------------------
{
  const samples = Array.from({ length: 30 }, (_, i) => sample(i + 1, +(i * 0.05).toFixed(4), { livePanels: 4, rate: 600 }));
  const file = writeFixture('healthy', samples);
  let out = '', threw = null, code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(HERE, 'b122-rehearsal.mjs'), `--gradeOnly=${file}`, '--killAtMin=0'], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { threw = e; code = e.status ?? -1; out = `${e.stdout || ''}${e.stderr || ''}`; }

  check('the grading block runs end to end without a ReferenceError',
    !/ReferenceError|is not defined/.test(out), (out.match(/.*(ReferenceError|is not defined).*/) || [''])[0]);
  check('it printed gate lines rather than dying early', /GATE|gate|PASS|FAIL/.test(out), out.slice(0, 200));
  check('it reached the warm-up boundary gate', /warm-up boundary|reference window/i.test(out), 'boundary gate line absent from output');
  if (threw && !/ReferenceError/.test(out)) console.log(`    (exit ${code} — gates may legitimately fail on a synthetic fixture)`);
}

// ---- 2. the defect B found: a baseline anchored in warm-up ---------------------------------------
{
  // Delivery DECAYS 600 -> 400 across the run: a true RATE-HOLD FAIL of 33%.
  // But the first three samples have no live panels and read an inflated 900.
  const warm = [
    sample(1, 0.00, { livePanels: 0, rate: 900 }),
    sample(2, 0.05, { livePanels: 0, rate: 900 }),
    sample(3, 0.10, { livePanels: 2, rate: 850 }),
    ...Array.from({ length: 27 }, (_, i) => sample(i + 4, +(0.15 + i * 0.05).toFixed(4), { livePanels: 4, rate: 600 - i * 7.4 })),
  ];

  const graded = evaluateRateHold(warm);
  check('warm-up samples are excluded from the reference window',
    graded.warmupExclusion?.state === 'WARMUP_EXCLUDED', JSON.stringify(graded.warmupExclusion?.state));
  check('the boundary is recorded for audit',
    graded.warmupExclusion?.boundaryHours === 0.15 && graded.warmupExclusion?.samplesExcluded === 3,
    `boundary ${graded.warmupExclusion?.boundaryHours} h, excluded ${graded.warmupExclusion?.samplesExcluded}`);
  check('the excluded live counts travel with the verdict',
    JSON.stringify(graded.warmupExclusion?.excludedLivePanels) === '[0,0,2]', JSON.stringify(graded.warmupExclusion?.excludedLivePanels));
  check('the decaying run is graded FAIL, not rescued by the warm-up anchor',
    graded.verdict === 'RATE-HOLD FAIL', `${graded.verdict} ratio ${graded.holdRatio}`);
  check('every sample in the reference window had four panels live',
    Array.isArray(graded.baselineWindowLivePanels) && graded.baselineWindowLivePanels.every((c) => c === 4),
    JSON.stringify(graded.baselineWindowLivePanels));

  // The counterfactual: the OLD fixed window would have anchored on the inflated warm-up samples.
  const oldWindow = warm.filter((s) => s.hours >= 0.05 && s.hours <= 0.25);
  const anchoredOnWarmup = oldWindow.some((s) => s.livePanels < 4);
  check('the old fixed 0.05-0.25 h window did contain dead-panel samples (the defect was real)',
    anchoredOnWarmup, 'no dead-panel samples in the old window — fixture does not reproduce the defect');
}

// ---- 3. panels that never come up cannot be graded at all ----------------------------------------
{
  const never = Array.from({ length: 20 }, (_, i) => sample(i + 1, +(i * 0.05).toFixed(4), { livePanels: i % 4 === 0 ? 4 : 1, rate: 600 }));
  const graded = evaluateRateHold(never);
  check('panels that never HOLD the count VOID the verdict',
    graded.verdict === 'VOID' && graded.warmupExclusion?.state === 'NEVER_REACHED', `${graded.verdict} / ${graded.warmupExclusion?.state}`);
  check('the VOID names the peak and the longest run',
    /peak|longest|best run/i.test(graded.why || ''), graded.why);
}

// ---- 4. panels lost LATE must still FAIL, never be excused as warm-up -----------------------------
{
  const lateLoss = [
    ...Array.from({ length: 15 }, (_, i) => sample(i + 1, +(i * 0.05).toFixed(4), { livePanels: 4, rate: 600 })),
    ...Array.from({ length: 15 }, (_, i) => sample(i + 16, +(0.75 + i * 0.05).toFixed(4), { livePanels: 1, rate: 150 })),
  ];
  const graded = evaluateRateHold(lateLoss);
  check('a panel lost at hour six is a FAIL, not an exclusion',
    graded.verdict === 'RATE-HOLD FAIL', `${graded.verdict} ratio ${graded.holdRatio}`);
  check('the final window reports its degraded live count',
    Array.isArray(graded.finalWindowLivePanels) && graded.finalWindowLivePanels.every((c) => c === 1),
    JSON.stringify(graded.finalWindowLivePanels));
  check('warm-up exclusion did not swallow the late loss',
    graded.warmupExclusion?.samplesExcluded === 0, `excluded ${graded.warmupExclusion?.samplesExcluded}`);
}

// ---- 5. a legacy series with no panel field is flagged, not silently trusted ----------------------
{
  const legacy = Array.from({ length: 20 }, (_, i) => {
    const s = sample(i + 1, +(i * 0.05).toFixed(4), { livePanels: 4, rate: 600 });
    delete s.livePanels; delete s.panelsLive;
    return s;
  });
  const graded = evaluateRateHold(legacy);
  check('a series with no livePanels grades but is marked unaudited',
    graded.warmupExclusion?.state === 'UNDETERMINED_NO_PANEL_FIELD' && graded.warmupExclusion?.audited === false,
    JSON.stringify(graded.warmupExclusion?.state));
  check('the unaudited state says a ten-hour arm must not use it',
    /must NOT be graded this way|refuses an unaudited/i.test(graded.warmupExclusion?.note || ''), graded.warmupExclusion?.note);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
