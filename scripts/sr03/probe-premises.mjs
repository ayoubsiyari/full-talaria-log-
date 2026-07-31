import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const CENSUS = JSON.parse(fs.readFileSync(
  `${ROOT}/docs/plan3/evidence/A-SR02-FOCUS-ROUTING-20260731/window-chart-classification.json`, 'utf8'));

console.log('########## A. POLICY 5 sites: what is `this` there? ##########');
const P5 = [['chart-indicators-full.js', 2206], ['chart-indicators-full.js', 2305],
  ['chart-indicators-full.js', 3144], ['chart-indicators-full.js', 4963], ['indicator-ui.js', 3100]];
for (const [f, l] of P5) {
  const s = CENSUS.sites.find((x) => x.file === f && x.line === l);
  console.log(`${f}:${l}  binding=${s.binding}  class=${s.class}  method=${s.method}  comparedToThis=${s.comparedToThis}`);
}
console.log('\n-- for contrast, a known CLASS_METHOD site --');
for (const [f, l] of [['chart.js', 17215], ['chart.js', 5352], ['chart.js', 19329], ['chart.js', 25755], ['chart.js', 18419], ['chart.js', 17248]]) {
  const s = CENSUS.sites.find((x) => x.file === f && x.line === l);
  console.log(`${f}:${l}  binding=${s.binding}  class=${s.class}  method=${s.method}`);
}

console.log('\n########## B. binding distribution over all 36 AMBIGUOUS ##########');
const dist = {};
for (const s of CENSUS.sites.filter((x) => x.bucket === 'AMBIGUOUS' && x.logicalHead)) {
  dist[s.binding] = (dist[s.binding] || 0) + 1;
}
console.log(JSON.stringify(dist));

console.log('\n########## C. panelManager assignment census ##########');
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (/node_modules|\.git$/.test(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const ENGINE = [`${ROOT}/chart v 1.4/chart/chart.js`,
  ...fs.readdirSync(`${ROOT}/chart v 1.4/chart/modules`).filter((f) => f.endsWith('.js'))
    .map((f) => `${ROOT}/chart v 1.4/chart/modules/${f}`)];

let asgEngine = 0; const asgEngineD = [];
let refEngine = 0;
for (const p of ENGINE) {
  const L = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  L.forEach((l, i) => {
    if (/\bpanelManager\s*=(?!=)/.test(l)) { asgEngine++; asgEngineD.push(`${path.basename(p)}:${i + 1}  ${l.trim().slice(0, 110)}`); }
    if (/\bpanelManager\b/.test(l)) refEngine++;
  });
}
console.log(`ENGINE JS (chart.js + modules/*.js): panelManager assignments=${asgEngine}  reference LINES=${refEngine}`);
asgEngineD.forEach((d) => console.log('   ' + d));

let ctl = 0;
for (const p of ENGINE) {
  const L = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  L.forEach((l) => { if (/\bdrawingManager\s*=(?!=)/.test(l)) ctl++; });
}
console.log(`CONTROL: drawingManager assignments in same scope = ${ctl}`);

console.log('\n-- whole chart tree (any file type) --');
let asgAll = 0; const asgAllD = [];
for (const p of walk(`${ROOT}/chart v 1.4`)) {
  const L = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  L.forEach((l, i) => {
    if (/\bpanelManager\s*=(?!=)/.test(l)) { asgAll++; asgAllD.push(`${p.replace(ROOT, '').replace(/\\/g, '/')}:${i + 1}  ${l.trim().slice(0, 100)}`); }
  });
}
console.log(`tree-wide panelManager assignments = ${asgAll}`);
asgAllD.forEach((d) => console.log('   ' + d));

console.log('\n########## D. is indicator-ui.js:3100 guarded? ##########');
const iu = fs.readFileSync(`${ROOT}/chart v 1.4/chart/modules/indicator-ui.js`, 'utf8').split(/\r?\n/);
console.log(`3100: ${iu[3099]}`);
console.log(`guarded by 'window.chart &&' on same line: ${/window\.chart\s*&&\s*window\.chart\.panelManager/.test(iu[3099])}`);
