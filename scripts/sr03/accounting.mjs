/** SR-03 final accounting: state of every briefed site, measured on disk. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const BASE = '350707826';
const CD = path.join(ROOT, 'chart v 1.4', 'chart');
const now = (f) => fs.readFileSync(path.join(CD, f), 'utf8').split(/\r?\n/);
const base = (f) => execFileSync('git', ['show', `${BASE}:chart v 1.4/chart/${f}`],
  { cwd: ROOT, maxBuffer: 1 << 30, encoding: 'utf8' }).split(/\r?\n/);

const SITES = [
  ['P1', 'chart.js', 17215, 'hideSettingsMenu'],
  ['P1', 'chart.js', 18419, 'setupSymbolSearchSwitcher'],
  ['P1', 'modules/economic-news-sidebar.js', 261, 'mainChart()'],
  ['P1', 'modules/economic-news-sidebar.js', 1365, 'requestChartMarkerRedraw'],
  ['P1', 'modules/economic-news-sidebar.js', 1577, 'catch-up timer'],
  ['P1', 'modules/economic-news-sidebar.js', 1587, 'notifyChartRender'],
  ['P1', 'modules/favorites-manager.js', 628, 'activateTool'],
  ['P1', 'modules/indicator-ui.js', 4010, 'indicator chrome'],
  ['P1', 'modules/indicator-ui.js', 4964, 'indicator chrome'],
  ['P1', 'modules/indicator-ui.js', 6247, '_tryInitIndicatorUI'],
  ['P1', 'modules/compare-overlay.js', 285, '_bindCompareModalDomOnce'],
  ['P1', 'modules/compare-overlay.js', 323, 'setupEventListeners'],
  ['P1', 'modules/screenshot-manager.js', 1706, 'initScreenshotManager'],
  ['P1', 'modules/screenshot-manager.js', 1707, 'initScreenshotManager'],
  ['P2', 'chart.js', 19329, '_findActivePanChart'],
  ['P2', 'chart.js', 5352, '_panelPanHistoryGapNeedsHostMore'],
  ['P2', 'chart.js', 25755, 'checkViewportLoadMore'],
  ['P4', 'chart.js', 549, 'boot guard'],
  ['P4', 'chart.js', 42890, '_talariaInitializeChart'],
  ['P4', 'chart.js', 17248, '_applyChartSettingsImmediate'],
  ['P4', 'modules/indicator-ui.js', 3107, 'idempotent shape'],
  ['P4', 'modules/drawing-tools-manager.js', 844, '_setupCrossPanelDeselect'],
  ['P4', 'modules/chart-window-limit.js', 185, 'window limit'],
  ['P4', 'modules/replay-dashboard-sync.js', 11, 'dashboard'],
  ['P4', 'modules/replay-system.js', 10678, "literal 'main'"],
  ['P4', 'modules/v9-theme-bridge.js', 203, 'theme'],
  ['P5', 'modules/chart-indicators-full.js', 2206, 'vwapCurrentAssetClass'],
  ['P5', 'modules/chart-indicators-full.js', 2305, 'vwapCorporateEventTimestamps'],
  ['P5', 'modules/chart-indicators-full.js', 3144, 'killzonesBarWallClock'],
  ['P5', 'modules/chart-indicators-full.js', 4963, 'timezone id resolve'],
  ['P5', 'modules/indicator-ui.js', 3100, 'talariaChartForOhlcPanel'],
];

const baseCache = new Map(); const nowCache = new Map();
const bl = (f) => { if (!baseCache.has(f)) baseCache.set(f, base(f)); return baseCache.get(f); };
const nl = (f) => { if (!nowCache.has(f)) nowCache.set(f, now(f)); return nowCache.get(f); };

console.log('policy | file:line | changed | base text -> current text');
console.log('-'.repeat(120));
const tally = {};
for (const [pol, f, line, role] of SITES) {
  const b = (bl(f)[line - 1] || '').trim();
  // Locate the same logical line now: search for the base text; if the file grew
  // by an installer the line number shifts.
  // Ignore matches inside the installed resolver block: its OFF arm legitimately
  // still contains the old chain text and would mask a real conversion.
  const cur = nl(f);
  const insStart = cur.findIndex((l) => l.includes("typeof window.__talariaActiveChartV1 !== 'function'"));
  const insEnd = insStart === -1 ? -1 : cur.findIndex((l, i) => i > insStart && l === '}');
  const outside = cur.filter((l, i) => insStart === -1 || i < insStart || i > insEnd);
  const exactSame = (cur[line - 1] || '').trim() === b;
  const stillPresent = outside.some((l) => l.trim() === b);
  const changed = !stillPresent;
  tally[pol] = tally[pol] || { total: 0, changed: 0 };
  tally[pol].total++; if (changed) tally[pol].changed++;
  console.log(`${pol} | ${f}:${line} (${role}) | ${changed ? 'CONVERTED' : (exactSame ? 'unchanged' : 'unchanged(shifted)')}`);
  if (changed) console.log(`      base: ${b}`);
}
console.log('\n--- tally: sites whose base source line no longer exists (i.e. converted) ---');
for (const [k, v] of Object.entries(tally)) console.log(`${k}: ${v.changed} converted of ${v.total} briefed`);

console.log('\n--- residual chain / resolver counts (canonical tree) ---');
const files = ['chart.js', ...fs.readdirSync(path.join(CD, 'modules')).filter((x) => x.endsWith('.js')).map((x) => `modules/${x}`)];
let chain = 0; const chainD = [];
let res = 0; const resD = [];
for (const f of files) {
  nl(f).forEach((l, i) => {
    if (/window\.chart\s*\|\|\s*window\.mainChart/.test(l)) { chain++; chainD.push(`${f}:${i + 1}  ${l.trim().slice(0, 90)}`); }
    if (/__talariaActiveChartV1\(\)/.test(l)) { res++; resD.push(`${f}:${i + 1}`); }
  });
}
console.log(`remaining "window.chart || window.mainChart" chains: ${chain}`);
chainD.forEach((d) => console.log('   ' + d));
console.log(`resolver call sites: ${res}`);
resD.forEach((d) => console.log('   ' + d));
