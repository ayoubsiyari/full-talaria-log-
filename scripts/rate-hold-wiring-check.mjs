#!/usr/bin/env node
/**
 * Prove the RATE-HOLD wiring EXECUTES, not merely that it parses.
 *
 * `node --check` passed the soak while it referenced an undefined BASE_TF_SEC — a ReferenceError that
 * would have fired at sample two of a ten-hour run and killed the night. Syntax checking cannot see an
 * undefined identifier inside a function that has not run yet, so the identifiers on the hot path are
 * executed here against fakes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { deliveredRate, evaluateRateHold, readEffectiveRateReadback } from './lib/rate-hold.mjs';
import { pauseProbe } from './lib/pause-probe.mjs';
import { readStorageCensus, diffStorage } from './lib/storage-census.mjs';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const results = [];
const check = (n, p, d) => { results.push({ name: n, pass: p, detail: d }); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

// 1. Every identifier the soak's hot path names must exist in the source it imports from.
{
  const src = fs.readFileSync('scripts/sealed-two-arm-soak.mjs', 'utf8');
  const named = ['deliveredRate', 'evaluateRateHold', 'readEffectiveRateReadback', 'pauseProbe', 'readStorageCensus', 'diffStorage', 'tfSeconds'];
  const missing = named.filter((n) => !new RegExp(`\\b${n}\\b`).test(src));
  check('every helper the loop calls is referenced in the soak', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${named.length} present`);

  // The defect that started this file: an identifier used and never bound. The first version of this
  // check scanned raw source and flagged 78 words out of COMMENTS and string literals - a test producing
  // pure noise, which is worse than none because a real hit would be invisible in it. Comments and
  // strings are stripped so what is left is code.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  const used = new Set([...code.matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)].map((m) => m[1]));
  const bound = (u, s) => new RegExp(`(?:const|let|var|function)\\s+${u}\\b`).test(s)
    || new RegExp(`import[^;]*\\b${u}\\b`).test(s)
    || new RegExp(`process\\.env\\.${u}\\b`).test(s)   // env reads are bound by definition
    || new RegExp(`\\b${u}\\s*[:=]`).test(s);
  const unbound = [...used].filter((u) => !bound(u, code));
  check('no SCREAMING_CASE identifier is used without being bound (comments and strings stripped)',
    unbound.length === 0, unbound.length ? `UNBOUND: ${unbound.join(', ')}` : `${used.size} such identifiers, all bound`);

  // Control: the check must FAIL on the exact defect it was written for, or it proves nothing.
  const injected = `${code}\nconst z = SOME_UNDEFINED_CAP;`;
  const caught = [...new Set([...injected.matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)].map((m) => m[1]))]
    .filter((u) => !bound(u, injected));
  check('CONTROL: the unbound-identifier check catches an injected unbound constant',
    caught.includes('SOME_UNDEFINED_CAP'), caught.length ? `caught ${caught.join(', ')}` : 'CAUGHT NOTHING — the check is vacuous');
}

// 2. The timeframe denominator, executed.
{
  const src = fs.readFileSync('scripts/sealed-two-arm-soak.mjs', 'utf8');
  const body = src.match(/function tfSeconds\(tf\)\s*\{[\s\S]*?\n\}/)[0];
  const tfSeconds = new Function(`${body}; return tfSeconds;`)();
  const cases = [['1m', 60], ['5m', 300], ['15m', 900], ['1h', 3600], ['4h', 14400], ['1d', 86400], ['30s', 30]];
  const bad = cases.filter(([i, o]) => tfSeconds(i) !== o);
  check('the bars/s denominator is read from the panel timeframe, all cases', bad.length === 0,
    bad.length ? `wrong: ${JSON.stringify(bad)}` : cases.map(([i, o]) => `${i}=${o}s`).join(' '));
  check('an unreadable timeframe returns null rather than a wrong denominator',
    tfSeconds('weekly') === null && tfSeconds(null) === null && tfSeconds('') === null, 'null on garbage');
}

// 3. The pause-probe refuses when the pause did not take.
{
  const fakePage = {
    evaluate: async (fn, arg) => (arg === false ? [{ was: true, now: true }] : [{ was: false, now: true }]),
    frames: () => [],
  };
  const probe = await pauseProbe(fakePage, { readFootprint: async () => ({ footprintTotalMB: 1500 }), frothWaitMs: 1, reclaimWaitMs: 1, log: () => {} });
  check('a pause that did not pause VOIDs instead of reporting froth as hoard',
    probe.verdict === 'VOID' && /not verified/.test(probe.why), probe.verdict);
}

// 4. The pause-probe arithmetic on a pause that DID take.
{
  const mb = [1800, 1500, 1400];
  let i = 0;
  const fakePage = { evaluate: async (fn, arg) => [{ was: true, now: arg === true }], frames: () => [] };
  const probe = await pauseProbe(fakePage, { readFootprint: async () => ({ footprintTotalMB: mb[Math.min(i++, 2)] }), frothWaitMs: 1, reclaimWaitMs: 1, log: () => {} });
  check('froth and hoard are separated arithmetically',
    probe.verdict === 'MEASURED' && probe.frothDrainedMB === 300 && probe.slowReclaimedMB === 100 && probe.hoardFloorMB === 1400,
    `running 1800 -> froth -300 -> reclaim -100 -> hoard ${probe.hoardFloorMB} MB (${probe.frothPercentOfRunning}% froth)`);
}

// 5. The read-back witness reports ABSENT without throwing when the field is not in the build.
{
  const fakePage = { frames: () => [{ url: () => 'http://x/chart/', evaluate: async (fn) => fn() }] };
  global.window = {};
  const rb = await readEffectiveRateReadback(fakePage);
  check('an absent __talariaEffectiveRate is reported as a missing WITNESS, not a missing verdict',
    rb.present === false && /missing witness, not a missing verdict/.test(rb.absentNote), rb.absentNote?.slice(0, 60));
  delete global.window;
}

// 6. Storage diff arithmetic.
{
  const a = { originUsageMB: 10, localStorageBytesAllRealms: 1000, cacheStorageCount: 2, indexedDbCount: 1, sessionStorageBytesAllRealms: 0 };
  const b = { originUsageMB: 47.5, localStorageBytesAllRealms: 3000, cacheStorageCount: 3, indexedDbCount: 1, sessionStorageBytesAllRealms: 0 };
  const d = diffStorage(a, b);
  check('storage growth is stated rather than left to be subtracted',
    d.ok && d.originUsageDeltaMB === 37.5 && d.localStorageDeltaBytes === 2000, `+${d.originUsageDeltaMB} MB origin usage`);
}

const passed = results.filter((r) => r.pass).length;
fs.writeFileSync(path.join(EV, 'RATE-HOLD-WIRING-CHECK.json'), JSON.stringify({
  signature: 'RATE-HOLD-WIRING-CHECK-V1', at: new Date().toISOString(),
  bfcacheState: 'not applicable — fakes and source inspection, no browser.',
  whyThisExists: 'node --check passed the soak while it referenced an undefined BASE_TF_SEC, which would have thrown at sample two of a ten-hour run.',
  passed, total: results.length, results,
}, null, 1));
console.log(`\n${passed}/${results.length} passed`);
process.exitCode = passed === results.length ? 0 : 1;
