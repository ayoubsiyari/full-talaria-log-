/**
 * FIX-01 ladder item 1 ("window recalc to visible plus warm-up") = C's SHOT 1.
 *
 * Before any cut: map the sites and clear CONF-03. My clone/reseed cuts were
 * both structurally inert under four symbols and I only found out after
 * shipping, so reachability is checked FIRST and with positive controls -
 * an empty result is unproven until a control proves the matcher works.
 *
 * Read-only.
 */
import fs from 'node:fs';

const F = 'chart v 1.4/chart/modules/chart-indicators-full.js';
const src = fs.readFileSync(F, 'utf8');
const lines = src.split('\n');

const count = (needle) => src.split(needle).length - 1;

console.log(`=== ${F} (${lines.length} lines) ===\n`);

console.log('--- the mechanism C named ---');
for (const id of ['_m19iB62WindowFp', '_m19iExactTailPaintFp', '_indicatorAsyncDataToken',
  '_m19iB62IsTailTokenStale', '_m19iExactTailPaint', 'drawIndicatorsOptimized',
  '_m19iExactTailPaintEnabled']) {
  console.log(`  ${id.padEnd(28)} ${count(id)}`);
}

console.log('\n--- POSITIVE CONTROL: the matcher finds known-present identifiers ---');
for (const id of ['function', 'Chart.prototype', 'this.chart']) {
  console.log(`  ${id.padEnd(28)} ${count(id)}`);
}

console.log('\n--- every call site of the hasher, with its range argument ---');
lines.forEach((l, i) => {
  if (!l.includes('_m19iB62WindowFp')) return;
  const n = i + 1;
  const isDef = /_m19iB62WindowFp\s*=|function\s+_m19iB62WindowFp|_m19iB62WindowFp\s*\(data\s*,\s*start/.test(l);
  console.log(`  ${String(n).padStart(6)} ${isDef ? '[DEF ]' : '[CALL]'} ${l.trim().slice(0, 130)}`);
});

console.log('\n--- CONF-03: is any call site same-pair gated? (60 lines above each) ---');
const GUARDS = ['_multichartSamePairAsHost', '_isIndependentMultichartPair',
  '_multichartFinerSamePairPanelSelfOwns', '_shouldAnchorPairSwitchToHostPlayhead'];
console.log(`  guard identifiers anywhere in THIS file:`);
for (const g of GUARDS) console.log(`    ${g.padEnd(40)} ${count(g)}`);

const callLines = [];
lines.forEach((l, i) => { if (l.includes('_m19iB62WindowFp(')) callLines.push(i + 1); });
for (const n of callLines) {
  const above = lines.slice(Math.max(0, n - 61), n).join('\n');
  const hits = GUARDS.filter((g) => above.includes(g));
  console.log(`  line ${String(n).padStart(6)}: ${hits.length ? `GATED by ${hits.join(', ')}` : 'no same-pair guard within 60 lines above'}`);
}

console.log('\n--- CONTROL that the guard matcher is not simply broken (chart.js) ---');
try {
  const cj = fs.readFileSync('chart v 1.4/chart/chart.js', 'utf8');
  for (const g of GUARDS) console.log(`    ${g.padEnd(40)} ${cj.split(g).length - 1} in chart.js`);
} catch (e) { console.log(`    could not read chart.js: ${e.message}`); }

console.log('\n--- the precedent C cites: a BOUNDED caller already exists ---');
lines.forEach((l, i) => {
  if (/tailStart/.test(l)) console.log(`  ${String(i + 1).padStart(6)} ${l.trim().slice(0, 130)}`);
});

console.log('\n--- existing kill-switch (the A/B probe, NOT the fix) ---');
for (const id of ['__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1']) {
  console.log(`  ${id} = ${count(id)}`);
  lines.forEach((l, i) => { if (l.includes(id)) console.log(`    ${String(i + 1).padStart(6)} ${l.trim().slice(0, 120)}`); });
}
