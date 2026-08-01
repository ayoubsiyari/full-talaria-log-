#!/usr/bin/env node
/**
 * RELIEF-01 control suite.
 *
 * A would-fire query that fires on everything is not a valve, and the only evidence I had was one real
 * build that fires. These are synthetic series with KNOWN answers, run through the real CLI on the real
 * loader - not through a restatement of its logic - so the thing under test is the thing that ships.
 *
 * The two the Director specified are controls 1 and 2. Control 3 is the one that decides the design:
 * a CONCAVE build that lands UNDER budget but whose early slope, projected linearly, looks like a
 * catastrophe. If the valve fires on it, it fails passing builds.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'relief01-'));
const BASE = 1400;
const HOURS = 10;
const STEP = 0.05;      // 3-minute cadence, as the sealed soak samples
const BUDGET = 1024;

// Deterministic jitter: a control that passes only on a lucky noise draw proves nothing.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const noise = (mb) => (rnd() - 0.5) * 2 * mb;

function write(name, growthFn, { barsPerHour = 6000 } = {}) {
  const file = path.join(TMP, `${name}.jsonl`);
  const lines = [];
  let n = 0;
  for (let t = 0; t <= HOURS + 1e-9; t += STEP) {
    n += 1;
    lines.push(JSON.stringify({
      n, hours: +t.toFixed(4),
      footprintTotalMB: +(BASE + growthFn(t) + noise(6)).toFixed(1),
      residentBars: Math.round(7000 + barsPerHour * t),
      closedTrades: 0, segment: 1,
    }));
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

const run = (file) => {
  const r = spawnSync(process.execPath, ['--max-old-space-size=1024', 'scripts/relief01-would-fire.mjs', `--in=${file}`, `--budgetMB=${BUDGET}`, `--horizonHours=${HOURS}`], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const fired = /WOULD FIRE/.test(out) && !/WOULD NOT FIRE/.test(out);
  const voided = /VOID/.test(out);
  const m = out.match(/WOULD FIRE at hour ([\d.]+)/);
  return { fired, voided, fireHour: m ? Number(m[1]) : null, out };
};

// Concave: growth = A(1 - e^{-t/tau}). Steep early, flattening - the shape my own runs have, because the
// delivered bar rate decays (20.6 -> 9.19 bars/s within one run) while growth per BAR stays straight.
const concave = (final, tau) => { const A = final / (1 - Math.exp(-HOURS / tau)); return (t) => A * (1 - Math.exp(-t / tau)); };

const CONTROLS = [
  {
    name: '1. PASSES — tracks to 1,020 MB, linear',
    file: () => write('pass-linear', (t) => 102 * t),
    expectFire: false,
    why: "The Director's first example. Meets the bar with 4 MB to spare and must never fire; a valve that fires here is the 85%-instantaneous design being reinvented.",
  },
  {
    name: '2. FAILS — tracks to 1,500 MB, linear',
    file: () => write('fail-linear', (t) => 150 * t),
    expectFire: true,
    maxFireHour: 2.5,
    why: "The Director's second example. Must fire in the first hour or two, while relief is still cheap.",
  },
  {
    name: '3. PASSES but CONCAVE — lands ~1,000 MB, early slope looks catastrophic',
    file: () => write('pass-concave', concave(1000, 2.5)),
    expectFire: false,
    why: 'THE DESIGN TEST. Linear-forward off the trailing slope projects ~2,000 MB around hour 2. Only the slope-stability guard keeps this build from being failed for a curve shape that is normal on this product.',
  },
  {
    name: '4. FAILS and CONCAVE — lands ~2,600 MB',
    file: () => write('fail-concave', concave(2600, 2.5)),
    expectFire: true,
    why: 'Concavity must not become a blanket excuse. A genuinely failing build that also bends still has to fire.',
  },
  {
    name: '5. BORDERLINE — lands exactly on 1,024 MB',
    file: () => write('borderline', (t) => 102.4 * t),
    expectFire: false,
    why: 'A build that exactly meets the bar passes. This is the case the 85%-instantaneous rule got wrong by construction.',
  },
  {
    name: '6. TOO SHORT — 8 samples, no fit possible',
    file: () => {
      const f = path.join(TMP, 'tooshort.jsonl');
      fs.writeFileSync(f, Array.from({ length: 8 }, (_, i) => JSON.stringify({ n: i + 1, hours: +(i * STEP).toFixed(4), footprintTotalMB: BASE + 400 * i * STEP, residentBars: 7000 + i * 300, closedTrades: 0, segment: 1 })).join('\n') + '\n');
      return f;
    },
    expectFire: false,
    expectSilentOnly: true,
    why: 'A series too short to fit must not be reported as a pass. Steep enough to fail if it could be judged, so a quiet "would not fire" here would be the valve failing open.',
  },
];

console.log(`RELIEF-01 controls — budget ${BUDGET} MB over ${HOURS} h\n`);
let failures = 0;
const results = [];
for (const c of CONTROLS) {
  const r = run(c.file());
  let ok = r.fired === c.expectFire;
  let note = '';
  if (ok && c.expectFire && c.maxFireHour != null && (r.fireHour == null || r.fireHour > c.maxFireHour)) {
    ok = false; note = `fired at h=${r.fireHour}, required by h=${c.maxFireHour}`;
  }
  if (c.expectSilentOnly) {
    // For the short series the only acceptable answers are VOID or a fire; a bare "would not fire" is the
    // silent pass this control exists to catch.
    ok = r.voided || r.fired;
    note = r.voided ? 'VOID (correct)' : (r.fired ? 'fired' : 'reported a quiet no-fire on an unfittable series');
  }
  if (!ok) failures += 1;
  const fireTxt = r.voided ? 'VOID' : (r.fired ? `FIRE h=${r.fireHour}` : 'no fire');
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  console.log(`      -> ${fireTxt}${note ? `  (${note})` : ''}`);
  console.log(`      ${c.why}\n`);
  results.push({ control: c.name, expectFire: c.expectFire, fired: r.fired, voided: r.voided, fireHour: r.fireHour, ok, note, why: c.why });
}

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
fs.mkdirSync(EV, { recursive: true });
fs.writeFileSync(path.join(EV, 'RELIEF01-CONTROLS.json'), JSON.stringify({
  signature: 'RELIEF01-CONTROLS-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — synthetic series, no browser.',
  budgetMB: BUDGET, horizonHours: HOURS, cadenceHours: STEP,
  passed: CONTROLS.length - failures, total: CONTROLS.length, results,
}, null, 1));

console.log(`${CONTROLS.length - failures}/${CONTROLS.length} controls passed`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exitCode = failures ? 1 : 0;
