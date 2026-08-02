/**
 * Probe: on multichart -> single chart, does the host keep the removed panels'
 * data refs?
 *
 * Lifts the real MC-host-cache ownership methods out of chart.js and drives
 * them, then checks removeChart's source for which release paths it actually
 * calls. Diagnostic for the PO's panel-teardown question.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART = path.resolve(__dirname, '../chart v 1.4/chart/chart.js');
const MGR = path.resolve(__dirname, '../chart v 1.4/chart/multichart-prod/multichart-manager.js');

const chartSrc = fs.readFileSync(CHART, 'utf8');
const mgrSrc = fs.readFileSync(MGR, 'utf8');

function lift(source, header) {
  const start = source.indexOf(header);
  if (start < 0) return null;
  let paren = source.indexOf('(', start);
  let pd = 0;
  let afterParams = -1;
  for (let i = paren; i < source.length; i += 1) {
    if (source[i] === '(') pd += 1;
    else if (source[i] === ')') { pd -= 1; if (pd === 0) { afterParams = i + 1; break; } }
  }
  const open = source.indexOf('{', afterParams);
  let d = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) return source.slice(start, i + 1); }
  }
  return null;
}

const names = [
  '_mcHostCacheReleaseEnabled(',
  '_mcHostCacheOwnerId(',
  '_retainMcHostCacheFile(',
  '_dropMcHostCacheFileRef(',
  '_releaseMcHostCacheFileRefs(',
];
const bodies = names.map((n) => {
  const b = lift(chartSrc, `    ${n}`) || lift(chartSrc, n);
  if (!b) { console.error(`ANCHOR_BROKEN: ${n} not found`); process.exit(2); }
  return b;
});

const ctx = vm.createContext({
  Map, Set, String, Number, Math, Date, Object, Array,
  window: { addEventListener() {}, removeEventListener() {} },
  console,
});
const proto = vm.runInContext(`({ ${bodies.join(',\n')} })`, ctx);

const makeChart = () => Object.assign(Object.create(proto), {
  _mcHostCacheFileRefs: new Map(),
  _mcHostCacheFileRefOwners: new Map(),
  _tfDataCache: new Map(),
  _btTfDataCache: new Map(),
  _smartPrefetchCache: new Map(),
  _mcHostCacheReleaseUnloadHandler: null,
});

const out = [];
const say = (l, v) => out.push([l, v]);

// Host holds the shared tf cache; four panels each retain one file in it.
const host = makeChart();
const panels = [0, 1, 2, 3].map(() => makeChart());
panels.forEach((p, i) => {
  host._tfDataCache.set(`FILE-${i}`, { bars: new Array(50000) });
  p._retainMcHostCacheFile(host, 'tf', `FILE-${i}`);
});
say('host tf-cache entries with 4 panels open', host._tfDataCache.size);

// Return to single chart WITHOUT the panel pagehide running (manager teardown
// only). removeChart never calls _releaseMcHostCacheFileRefs.
say('panels removed via manager teardown only', 'no _releaseMcHostCacheFileRefs call');
say('  host tf-cache entries after returning to 1 chart', host._tfDataCache.size);
say('  owner sets still pinned on host', host._mcHostCacheFileRefOwners.size);

// ANTI-VACUITY: the same teardown WITH the release call frees everything.
const host2 = makeChart();
const panels2 = [0, 1, 2, 3].map(() => makeChart());
panels2.forEach((p, i) => {
  host2._tfDataCache.set(`FILE-${i}`, { bars: new Array(50000) });
  p._retainMcHostCacheFile(host2, 'tf', `FILE-${i}`);
});
panels2.forEach((p) => p._releaseMcHostCacheFileRefs());
say('ANTI-VACUITY: same teardown with the release call', '');
say('  host tf-cache entries after returning to 1 chart', host2._tfDataCache.size);
say('  owner sets still pinned on host', host2._mcHostCacheFileRefOwners.size);

// Which release paths does removeChart actually call?
const removeChart = lift(mgrSrc, 'MultichartManager.prototype.removeChart =');
if (!removeChart) { console.error('ANCHOR_BROKEN: removeChart not found'); process.exit(2); }
say('removeChart calls bar-store release', /releasePanelSharedBarStoreRefsOnRemove|_releaseSharedBarStoreFileRefs/.test(removeChart) ? 'YES' : 'no');
say('removeChart calls host-cache release', /_releaseMcHostCacheFileRefs/.test(removeChart) ? 'YES' : 'NO  <-- asymmetry');

const releaseCallers = (chartSrc.match(/_releaseMcHostCacheFileRefs\(\)/g) || []).length;
say('_releaseMcHostCacheFileRefs call sites in chart.js', `${releaseCallers} (the pagehide handler)`);

const w = Math.max(...out.map(([l]) => l.length));
for (const [l, v] of out) console.log(`  ${l.padEnd(w)}  ${v}`);
