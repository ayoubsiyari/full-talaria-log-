#!/usr/bin/env node
/**
 * Does every line number on the kill roster point at the file the owning manager will actually open?
 *
 * The roster's citations came from measurements taken against the DEPLOYED origin. The working trees are a
 * different build. If those disagree, five lanes open a line number this morning and find unrelated code.
 * I supplied several of these citations myself, so this is my error to catch before it costs anyone a morning.
 */
import fs from 'node:fs';

const ORIGIN = 'http://31.97.192.82:3000';
const TARGETS = [
  ['LAG-1a', 'chart v 1.4/chart/modules/order-manager.js', '/chart/modules/order-manager.js', 40388, '_chartIndexForCloseMarkerOnChart'],
  ['LAG-1b', 'chart v 1.4/chart/chart.js', '/chart/chart.js', 30185, 'updateOrderLines'],
  ['LAG-2a', 'chart v 1.4/chart/modules/replay-dashboard-sync.js', '/chart/modules/replay-dashboard-sync.js', 10, ''],
  ['LAG-2b', 'chart v 1.4/chart/modules/replay-system.js', '/chart/modules/replay-system.js', 9800, 'm20Q6CapturedClear'],
  ['LAG-3', 'chart v 1.4/chart/modules/chart-indicators-full.js', '/chart/modules/chart-indicators-full.js', 10526, '_m19iB62WindowFp'],
  ['LIFE-2', 'chart v 1.4/chart/modules/chart-indicators-full.js', '/chart/modules/chart-indicators-full.js', 8001, 'new Worker'],
  ['INNER', 'chart v 1.4/chart/modules/indicator-ui.js', '/chart/modules/indicator-ui.js', 2968, 'talariaAppendIndicatorLegendRow'],
];

const report = {
  signature: 'ROSTER-LINE-CHECK-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — static source comparison, no browser.',
  question: 'Do the roster line numbers resolve in the WORKING TREE the owners will edit, or only in the DEPLOYED build the measurements came from?',
  rows: [],
};

const buildOf = (t) => (t.match(/CHART_ENGINE_BUILD\s*=\s*'([^']+)'/) || [])[1] || null;

for (const [row, localPath, remotePath, line, needle] of TARGETS) {
  const r = { row, file: remotePath.split('/').pop(), citedLine: line, needle: needle || '(line-only citation)' };
  let L = null;
  let R = null;
  try { L = fs.readFileSync(localPath, 'utf8').split('\n'); } catch { r.localMissing = true; }
  try { R = (await (await fetch(ORIGIN + remotePath)).text()).split('\n'); } catch { r.remoteMissing = true; }

  if (L) { r.localLines = L.length; r.localAtCitedLine = (L[line - 1] || '').trim().slice(0, 80); }
  if (R) { r.remoteLines = R.length; r.remoteAtCitedLine = (R[line - 1] || '').trim().slice(0, 80); }

  if (needle) {
    const hits = (arr) => { const o = []; arr.forEach((l, i) => { if (l.includes(needle)) o.push(i + 1); }); return o; };
    if (L) r.needleAtLocalLines = hits(L).slice(0, 8);
    if (R) r.needleAtRemoteLines = hits(R).slice(0, 8);
    r.citationResolvesLocally = !!(r.needleAtLocalLines || []).includes(line);
    r.citationResolvesRemotely = !!(r.needleAtRemoteLines || []).includes(line);
    r.symbolExistsLocally = (r.needleAtLocalLines || []).length > 0;
  }
  report.rows.push(r);
}

report.builds = {
  localChartJs: (() => { try { return buildOf(fs.readFileSync('chart v 1.4/chart/chart.js', 'utf8')); } catch { return null; } })(),
  deployedChartJs: await (async () => { try { return buildOf(await (await fetch(`${ORIGIN}/chart/chart.js`)).text()); } catch { return null; } })(),
};

const resolvable = report.rows.filter((r) => r.citationResolvesLocally === true).length;
const checkable = report.rows.filter((r) => r.citationResolvesLocally != null).length;
const symbolPresent = report.rows.filter((r) => r.symbolExistsLocally === true).length;

report.verdict = {
  localBuild: report.builds.localChartJs,
  deployedBuild: report.builds.deployedChartJs,
  citationsResolvingInTheWorkingTree: `${resolvable} of ${checkable}`,
  symbolsPresentInTheWorkingTree: `${symbolPresent} of ${checkable}`,
  reading: resolvable === checkable
    ? 'Line numbers resolve in the working tree. Owners can open them directly.'
    : `LINE NUMBERS DO NOT TRANSFER. The working tree is ${report.builds.localChartJs} and the citations were measured against ${report.builds.deployedChartJs}. Owners must locate by SYMBOL, not by line. The symbols themselves are ${symbolPresent === checkable ? 'all present, so the roster is sound - only the coordinates are stale' : 'NOT all present, which is a bigger problem than stale coordinates'}.`,
};

fs.writeFileSync('c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\ROSTER-LINE-CHECK-20260801.json', JSON.stringify(report, null, 1));
for (const r of report.rows) {
  console.log(`${r.row.padEnd(7)} ${r.file}:${r.citedLine}`);
  console.log(`   local  (${r.localLines} lines): ${r.localAtCitedLine ?? 'FILE NOT IN TREE'}`);
  console.log(`   remote (${r.remoteLines} lines): ${r.remoteAtCitedLine ?? 'not served'}`);
  if (r.needleAtLocalLines) console.log(`   symbol in tree at: ${r.needleAtLocalLines.join(', ') || 'ABSENT'}   remote at: ${(r.needleAtRemoteLines || []).join(', ') || 'absent'}`);
}
console.log(`\n${JSON.stringify(report.verdict, null, 1)}`);
