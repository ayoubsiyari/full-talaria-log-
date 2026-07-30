/**
 * Regrade of the element-writer attribution artifact.
 *
 * Two questions the artifact can answer but its summary did not ask:
 *
 *  Q1  Is the top writer's climb driven by CLOSED TRADES or by TIME?
 *      Levels are collinear (trades closed at a near-constant ~3/min for the whole
 *      run), so the levels regression cannot separate them. First differences can,
 *      and the artifact carries a natural POSITIVE CONTROL: the d3 defs/filter pair,
 *      a writer that is known to fire on trade close.
 *
 *  Q2  Can DOM element growth physically account for the renderer footprint slope
 *      that the duration gate measured? This is a unit check, not a statistical one.
 *
 * Static only. Reads recorded artifacts; starts no browser.
 */
import fs from 'node:fs';

const ARTIFACT = '_evidence/manager-C/ELEMENT-WRITER-ATTRIBUTION-V1-20260730-2205.json';
const V9 = 'R3@talaria-v9-live.js:40 < O_@talaria-v9-live.js:40 < R_@talaria-v9-live.js:40';
const DEFS = 'SVGDefsElement.<anonymous>@d3.min.js:2 < SVGDefsElement.<anonymous>@d3.min.js:2 < Vn.select@d3.min.js:2';

const j = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
const S = j.samples.map((s) => ({
  t: s.minutes,
  c: s.closed,
  v: s.bySig.find((b) => b.sig === V9)?.count ?? 0,
  d: s.bySig.find((b) => b.sig === DEFS)?.count ?? 0,
}));

const d = { t: [], c: [], v: [], f: [] };
for (let i = 1; i < S.length; i += 1) {
  d.t.push(S[i].t - S[i - 1].t);
  d.c.push(S[i].c - S[i - 1].c);
  d.v.push(S[i].v - S[i - 1].v);
  d.f.push(S[i].d - S[i - 1].d);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const corr = (a, b) => {
  const ma = mean(a); const mb = mean(b);
  let sab = 0; let saa = 0; let sbb = 0;
  for (let i = 0; i < a.length; i += 1) {
    sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
};

console.log('=== Q1  what drives the top writer? ===');
console.log(`samples ${S.length}, intervals ${d.v.length}, closed trades ${S[0].c} -> ${S[S.length - 1].c}`);
console.log(`predictor swing : closed trades per interval ${Math.min(...d.c)}..${Math.max(...d.c)}  (${Math.max(...d.c) / Math.min(...d.c)}x)`);
console.log(`response swing  : V9 elements per interval   ${Math.min(...d.v)}..${Math.max(...d.v)}  (${(Math.max(...d.v) / Math.min(...d.v)).toFixed(3)}x)`);
console.log('');
console.log('mean elements added, binned by trades closed in that interval:');
console.log('  trades |  n | V9 elements | d3 defs (POSITIVE CONTROL, fires on trade close)');
for (const k of [...new Set(d.c)].sort((a, b) => a - b)) {
  const idx = d.c.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0);
  console.log(`  ${String(k).padStart(6)} | ${String(idx.length).padStart(2)} | ${mean(idx.map((i) => d.v[i])).toFixed(2).padStart(11)} | ${mean(idx.map((i) => d.f[i])).toFixed(2)}`);
}
console.log('');
console.log(`corr(dV9,   dTrades) = ${corr(d.v, d.c).toFixed(4)}`);
console.log(`corr(dDefs, dTrades) = ${corr(d.f, d.c).toFixed(4)}   <-- control: the analysis CAN see a per-trade writer`);
console.log('');
console.log('VERDICT Q1: the control scales with trades and the top writer does not.');
console.log('  The per-trade figure is therefore NOT established. It is equally consistent');
console.log('  with a time-driven writer, because trades closed at a near-constant rate and');
console.log('  no interval in the run had zero closes. Decisive test, unrun and cheap:');
console.log('  one segment with the replay ADVANCING and NO trades closing.');

console.log('\n=== Q2  can element growth explain the renderer footprint slope? ===');
// Duration gate, commit e8ba8bdbc.
const gate = {
  rendererMBph: 735.0, rendererCI: [120.4, 1349.7],
  elementsPh: 1333.5, elementsCI: [290.7, 2376.2],
};
// C's attribution run measured the host climbing faster than the duration gate's total.
const attributionElementsPh = 5224.289;

const KB = (mbPerH, elemPerH) => (mbPerH * 1024) / elemPerH;
console.log(`implied cost per element, point estimate : ${KB(gate.rendererMBph, gate.elementsPh).toFixed(0)} KB/element`);
console.log(`  most favourable corner of both CIs     : ${KB(gate.rendererCI[0], gate.elementsCI[1]).toFixed(1)} KB/element`);
console.log(`  using C's faster host figure instead   : ${KB(gate.rendererMBph, attributionElementsPh).toFixed(0)} KB/element`);
console.log('');
for (const perElemKB of [1, 2, 4]) {
  const a = (gate.elementsPh * perElemKB) / 1024;
  const b = (attributionElementsPh * perElemKB) / 1024;
  console.log(`at ${perElemKB} KB/element: gate's ${gate.elementsPh}/h = ${a.toFixed(1)} MB/h `
    + `(${((a / gate.rendererMBph) * 100).toFixed(2)}% of the slope); `
    + `C's ${attributionElementsPh.toFixed(0)}/h = ${b.toFixed(1)} MB/h (${((b / gate.rendererMBph) * 100).toFixed(2)}%)`);
}
console.log('');
console.log('VERDICT Q2: a DOM element costs single-digit KB. Explaining +735 MB/h with');
console.log('  +1333 elements/h needs ~551 KB per element, which is 2-3 orders of magnitude');
console.log('  out. Even the CI corner most favourable to the hypothesis needs ~51 KB.');
console.log('  The element climb is real and worth fixing, but it is ~1-3% of the slope.');
