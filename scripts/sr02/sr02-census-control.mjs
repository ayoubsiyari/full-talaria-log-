/**
 * POSITIVE CONTROL for sr02-census.mjs.
 *
 * Standing rule: an empty result from a matcher is UNPROVEN, not zero. This
 * feeds the census a synthetic file containing every shape the census claims to
 * detect, plus every shape it must NOT match, and fails loudly if the detector
 * cannot see them or over-matches.
 *
 * Modelled on scripts/sr01/sr01-control-thisreach.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FIXTURE = `
// MUST MATCH: 8 real window.chart member expressions.
class Chart {
  method1() { return window.chart.data; }                 // CLASS_METHOD, class Chart
  method2() { const f = () => window.chart.w; return f; } // CLASS_METHOD via arrow
  method3() { function inner() { return window.chart.h; } return inner; } // INNER_FUNCTION
}
class OrderManager {
  place() { return window.chart.price; }                  // CLASS_METHOD, class OrderManager
}
function moduleLevel() { return window.chart; }           // INNER_FUNCTION (fn decl)
const arrowAtModule = () => window.chart.mouseX;          // MODULE (arrow at top level)
window.chart = new Chart();                               // WRITE site
if (window.chart) { moduleLevel(); }                      // bare read in if-test

// MUST NOT MATCH: near-miss shapes that a text matcher would wrongly count.
const a1 = window.chartWindowLimit;      // longer identifier
const a2 = window.chartIndicators.foo;   // longer identifier
const a3 = window.chart2;                // digit suffix
const a4 = 'window.chart in a string';   // string literal
const a5 = "also window.chart here";     // string literal
/* comment mentioning window.chart twice: window.chart */
// line comment window.chart
const a6 = other.chart;                  // wrong receiver
const a7 = window['chart'];              // computed member (deliberately excluded)
const a8 = win.window.chart;             // receiver is not the Identifier \`window\`
`;

// Hand-enumerated from the fixture:
//   CLASS_METHOD   3 = method1, method2 (arrow is transparent to `this`), place
//   INNER_FUNCTION 2 = method3's `inner`, `moduleLevel`
//   MODULE         3 = arrowAtModule, the `window.chart =` write, the `if` test
const EXPECT = {
  totalSites: 8,
  writes: 1,
  bindings: { CLASS_METHOD: 3, INNER_FUNCTION: 2, MODULE: 3 },
  classes: { Chart: 3, OrderManager: 1 },
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr02ctl-'));
const fixture = path.join(tmp, 'fixture.js');
const outJson = path.join(tmp, 'out.json');
fs.writeFileSync(fixture, FIXTURE);

const censusScript = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), 'sr02-census.mjs');
execFileSync(process.execPath, [censusScript, outJson, fixture], { stdio: 'pipe' });
const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));

const failures = [];
const check = (label, got, want) => {
  if (got !== want) failures.push(`${label}: got ${got}, expected ${want}`);
};

check('totalSites', report.totalSites, EXPECT.totalSites);
check('writes', report.writes, EXPECT.writes);
for (const [k, v] of Object.entries(EXPECT.bindings)) check(`binding.${k}`, report.byBinding[k] || 0, v);
for (const [k, v] of Object.entries(EXPECT.classes)) check(`class.${k}`, report.byClass[k] || 0, v);

// The over-match assertions are the load-bearing half: prove the near-misses
// were rejected. A text matcher on /window\.chart/ finds 19 hits in this fixture.
const textHits = (FIXTURE.match(/window\.chart/g) || []).length;
if (textHits <= EXPECT.totalSites) {
  failures.push(`CONTROL BROKEN: fixture must contain more text hits (${textHits}) than AST sites (${EXPECT.totalSites}) to prove over-match rejection`);
}

console.log(JSON.stringify({
  control: 'SR02-CENSUS-POSITIVE-CONTROL',
  fixtureTextHits: textHits,
  astSitesDetected: report.totalSites,
  overMatchesRejected: textHits - report.totalSites,
  byBinding: report.byBinding,
  byClass: report.byClass,
  writes: report.writes,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
}, null, 2));

if (failures.length) {
  console.log('\nSEARCH BROKEN — the census matcher does not see shapes it claims to detect.');
  process.exit(1);
}
console.log('\nCONTROL PASS — matcher sees all 8 real shapes and rejects all near-misses.');
fs.rmSync(tmp, { recursive: true, force: true });
