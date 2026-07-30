/**
 * CONF-03 reachability trace for the per-tick display re-resample.
 *
 * CONF-03 (promoted from my 14:40 clone/reseed answer): no optimisation is chosen
 * from a non-CONF-01 profile, and any proposal must trace its path as REACHABLE
 * UNDER FOUR SYMBOLS, with a positive control.
 *
 * The claim under test, from my own 'row-resample-above-paint-boundary':
 *   getDisplaySeries() is reached from calculateScales(), which sits ABOVE the
 *   paint-suppression boundary in render(), so a paint-suppressed background panel
 *   still pays a full re-resample every tick. The display cache key includes
 *   dataVersion, which bumps every tick, so the cache misses every tick.
 *
 * What would REFUTE it: a same-pair / host-symbol gate anywhere on the path, which
 * would make it inert at four distinct symbols exactly as the clone and reseed cuts
 * turned out to be.
 *
 * Static only. Resolves by symbol, never by my recorded line numbers, because the
 * mirrors diverge (1.88 MB vs 1.92 MB) and my line numbers have gone stale before.
 */
import fs from 'node:fs';

const FILES = {
  chart: 'chart v 1.4/chart/chart.js',
  pipeline: 'chart v 1.4/chart/modules/chart-data-pipeline.js',
};
const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

function findAll(s, re) {
  const out = []; let m;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  while ((m = r.exec(s)) !== null) out.push({ index: m.index, line: lineOf(s, m.index), text: m[0] });
  return out;
}
const count = (s, name) => findAll(s, new RegExp(`(^|[^A-Za-z0-9_$])${name}([^A-Za-z0-9_$]|$)`)).length;

console.log('=== 0. POSITIVE CONTROL: the matcher can see known symbols ===');
for (const [n, f] of [['render', 'chart'], ['calculateScales', 'chart'], ['currentFileId', 'chart'], ['resample', 'pipeline']]) {
  console.log(`  ${n.padEnd(18)} in ${f.padEnd(9)} = ${count(src[f], n)}`);
}
console.log('  (all must be non-zero, else SEARCH BROKEN and nothing below is evidence)');

console.log('\n=== 1. does the path exist, and where? ===');
for (const n of ['getDisplaySeries', 'calculateScales', '_resampleDataFull', 'dataVersion']) {
  const hits = findAll(src.chart, new RegExp(`(^|[^A-Za-z0-9_$])${n}([^A-Za-z0-9_$]|$)`));
  console.log(`  chart.js  ${n.padEnd(18)} = ${String(hits.length).padStart(3)}  lines: ${hits.slice(0, 12).map((h) => h.line).join(', ')}${hits.length > 12 ? ' ...' : ''}`);
}

console.log('\n=== 2. THE CONF-03 QUESTION: is any same-pair / host-symbol gate on the path? ===');
// These are the gates that made the clone and reseed cuts inert at four symbols.
const GATES = ['_multichartSamePairAsHost', '_isIndependentMultichartPair', '_mcCopySamePairFullRawData',
  '_multichartFinerSamePairPanelSelfOwns', '_shouldAnchorPairSwitchToHostPlayhead'];
console.log('  gate occurrences in the whole file (context for what follows):');
for (const g of GATES) console.log(`    ${g.padEnd(40)} = ${count(src.chart, g)}`);

// For each getDisplaySeries / calculateScales call site, look back for a gate.
const WINDOW = 3000; // chars of preceding context
for (const target of ['getDisplaySeries', 'calculateScales']) {
  const hits = findAll(src.chart, new RegExp(`(^|[^A-Za-z0-9_$])${target}\\s*\\(`));
  console.log(`\n  --- ${target}: ${hits.length} call-shaped site(s) ---`);
  for (const h of hits) {
    const before = src.chart.slice(Math.max(0, h.index - WINDOW), h.index);
    const found = GATES.filter((g) => before.includes(g));
    console.log(`    line ${String(h.line).padStart(6)}  gate within ${WINDOW} chars above: ${found.length ? found.join(', ') : 'NONE'}`);
  }
}

console.log('\n=== 3. is the cache key tick-churned? (does it include dataVersion) ===');
const keyHits = findAll(src.chart, /dataVersion/g);
for (const h of keyHits.slice(0, 10)) {
  const ctx = src.chart.slice(Math.max(0, h.index - 200), h.index + 200).replace(/\s+/g, ' ');
  console.log(`  line ${h.line}: ...${ctx}...`);
}

console.log('\n=== 4. pipeline: does the "incremental" branch still copy the whole prior array? ===');
for (const n of ['prevResampled', 'slice', 'sourceLength', 'resampleData']) {
  const hits = findAll(src.pipeline, new RegExp(`(^|[^A-Za-z0-9_$])${n}([^A-Za-z0-9_$]|$)`));
  console.log(`  chart-data-pipeline.js  ${n.padEnd(15)} = ${String(hits.length).padStart(3)}  lines: ${hits.slice(0, 10).map((h) => h.line).join(', ')}`);
}
