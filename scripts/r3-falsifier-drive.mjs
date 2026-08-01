#!/usr/bin/env node
/**
 * Drive the R3 falsifier once, on inputs whose answers are known.
 *
 * The verdict that matters is SCENARIO_ARTIFACT: no plateau, but an open position old enough that MEM-1a's
 * floor is pinning bars behind it BY DESIGN. Without that branch the falsifier would report MODEL_VOID on
 * a run where eviction behaved exactly as specified, and the night would be aborted for a scenario
 * artifact. That is the branch this drive exists to exercise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { evaluateR3 } from './lib/r3-falsifier.mjs';

const mk = (n, barsPerHour, { taper = 1, age = 0, eviction = true } = {}) => Array.from({ length: n }, (_, i) => {
  const h = i * 0.05;
  const frac = taper === 1 ? h : (1 - Math.exp(-h / taper)) * taper;
  return { hours: +h.toFixed(4), residentBars: Math.round(7000 + barsPerHour * frac), footprintTotalMB: 1400 + 24 * (barsPerHour * frac) / 1000, oldestOpenPositionAgeBars: age, evictionActive: eviction };
});

const CASES = [
  {
    name: 'plateau reached, no open position',
    samples: mk(40, 6000, { taper: 0.4, age: 0 }),
    expect: 'MODEL_HELD',
    why: 'Bars flatten while eviction is on. The model says exactly this.',
  },
  {
    name: 'NO plateau, and an OLD open position pinning bars',
    samples: mk(40, 6000, { taper: 1, age: 5200 }),
    expect: 'SCENARIO_ARTIFACT',
    why: 'THE BRANCH THAT MATTERS. MEM-1a pins bars behind an open position by design, so the absence of a plateau is the scenario, not the model. Without this the night aborts on a correct build.',
  },
  {
    name: 'NO plateau, and NO open position to blame',
    samples: mk(40, 6000, { taper: 1, age: 0 }),
    expect: 'MODEL_VOID',
    why: 'A clean falsifier failure: eviction on, nothing pinned, bars still climbing. Abort the night, keep the hour.',
  },
  {
    name: 'eviction never active',
    samples: mk(40, 6000, { taper: 1, age: 0, eviction: false }),
    expect: 'NOT_APPLICABLE',
    why: 'No plateau was predicted, so its absence refutes nothing.',
  },
  {
    name: 'too short to ask',
    samples: mk(6, 6000, { taper: 1, age: 0 }),
    expect: 'INSUFFICIENT',
    why: 'Six samples cannot void a model. Silence here must not read as a pass.',
  },
];

console.log('R3 falsifier drive\n');
let bad = 0;
const results = [];
for (const c of CASES) {
  const r = evaluateR3(c.samples);
  const ok = r.verdict === c.expect;
  if (!ok) bad += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  console.log(`      -> ${r.verdict}${ok ? '' : ` (expected ${c.expect})`}`);
  console.log(`      ${r.why}`);
  if (r.actionable) console.log(`      ACTION: ${r.action}`);
  console.log(`      ${c.why}\n`);
  results.push({ case: c.name, expected: c.expect, got: r.verdict, ok, detail: r });
}

// And against the rehearsal's own (throwaway) series, so the reader is exercised on a real artifact shape.
const REH = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\REHEARSAL-SOAK-TRADES.jsonl';
let live = null;
if (fs.existsSync(REH)) {
  const rows = fs.readFileSync(REH, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && r.n != null)
    .map((r) => ({ hours: r.hours, residentBars: r.residentBars, footprintTotalMB: r.footprintTotalMB, oldestOpenPositionAgeBars: r.oldestOpenPositionAgeBars ?? null, evictionActive: r.evictionActive ?? false }));
  live = evaluateR3(rows);
  console.log(`against the rehearsal series (${rows.length} samples, THROWAWAY): ${live.verdict} — ${live.why}`);
}

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
fs.writeFileSync(path.join(EV, 'R3-FALSIFIER-DRIVE.json'), JSON.stringify({
  signature: 'R3-FALSIFIER-DRIVE-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — synthetic series and one throwaway rehearsal artifact, no browser.',
  provenanceNote: 'The PO directive numbering R1-R4 is not in my tree. This implements the contract as the Director stated it at 14:45: read oldest-open-position age before declaring the model void, and on a clean failure abort the night but run to ~2 h. Correct against the directive if it differs.',
  passed: CASES.length - bad, total: CASES.length, results, againstRehearsalSeries: live,
}, null, 1));

console.log(`\n${CASES.length - bad}/${CASES.length} verdicts as expected`);
process.exitCode = bad ? 1 : 0;
