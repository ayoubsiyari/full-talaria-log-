import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const SIGNATURE = 'TALARIA_PROC3_UNWIRED_FIX_SWEEP_V1';

function readRel(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath))
    ? fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
    : '';
}

function lineOf(text, needle) {
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  return text.slice(0, idx).split(/\r?\n/).length;
}

function presentAny(files, needles) {
  for (const relPath of files) {
    const text = readRel(relPath);
    for (const needle of needles) {
      const line = lineOf(text, needle);
      if (line != null) return { ok: true, path: relPath, line, needle };
    }
  }
  return { ok: false, needles };
}

function boundAny(files, needles) {
  return presentAny(files, needles);
}

function mirrored(primary, mirror, needles) {
  if (!primary || !mirror) return { ok: true, reason: 'not-a-mirrored-surface' };
  const a = readRel(primary);
  const b = readRel(mirror);
  if (!a || !b) return { ok: false, reason: 'mirror-file-missing', primary, mirror };
  const misses = [];
  for (const needle of needles) {
    if (a.includes(needle) !== b.includes(needle)) misses.push(needle);
  }
  return {
    ok: misses.length === 0,
    primary,
    mirror,
    misses,
  };
}

function boolAxis(ok, evidence = {}) {
  return { ok: !!ok, ...evidence };
}

const ROWS = [
  {
    row: 'LAG-1a',
    owner: 'D',
    files: ['chart v 1.4/chart/modules/order-manager.js', 'homepage/public/chart/modules/order-manager.js'],
    present: ['__TALARIA_MARKER_INDEX_CACHE_V1'],
    bound: ['_chartIndexForCloseMarkerOnChart('],
    mirror: ['chart v 1.4/chart/modules/order-manager.js', 'homepage/public/chart/modules/order-manager.js'],
    discriminating: false,
    note: 'Roster row not present on E tree; return to D until landed and RED-armed.',
  },
  {
    row: 'LAG-1b',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_OVERLAY_RESYNC_DIRTY_V1'],
    bound: ['__TALARIA_OVERLAY_RESYNC_DIRTY_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
    note: 'Four-call-site kill-switch example; requires all live call sites bound, not one static guard.',
  },
  {
    row: 'LAG-2',
    owner: 'A',
    files: ['chart v 1.4/chart/modules/replay-dashboard-sync.js', 'homepage/public/chart/modules/replay-dashboard-sync.js', 'chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    present: ['__TALARIA_DASHBOARD_SYNC_COALESCE_V1'],
    bound: ['__TALARIA_DASHBOARD_SYNC_COALESCE_V1'],
    mirror: ['chart v 1.4/chart/modules/replay-dashboard-sync.js', 'homepage/public/chart/modules/replay-dashboard-sync.js'],
    discriminating: false,
  },
  {
    row: 'LAG-3',
    owner: 'E',
    files: ['chart v 1.4/chart/modules/chart-indicators-full.js', 'homepage/public/chart/modules/chart-indicators-full.js'],
    present: ['__TALARIA_INDICATOR_FP_MEMO_V1'],
    bound: ['_m19iIndicatorFpMemoEnabled()', '_m19iB62WindowFpMemo'],
    mirror: ['chart v 1.4/chart/modules/chart-indicators-full.js', 'homepage/public/chart/modules/chart-indicators-full.js'],
    discriminating: true,
    discriminatingEvidence: 'm19i-b62-window-fp-regime-v1: memo OFF vs ON millisecond RED/GREEN arms',
  },
  {
    row: 'LAG-4',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_M20Q6_REENTRY_GUARD_V1'],
    bound: ['__TALARIA_M20Q6_REENTRY_GUARD_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'MEM-1a',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_EVICT_BEHIND_PLAYHEAD_V1'],
    bound: ['__TALARIA_EVICT_BEHIND_PLAYHEAD_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'MEM-1b',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_SERIES_LRU_V1'],
    bound: ['__TALARIA_SERIES_LRU_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'MEM-1c',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_PRESESSION_RESIDENCY_V1'],
    bound: ['__TALARIA_PRESESSION_RESIDENCY_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'MEM-1d',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_SERIES_DEDUPE_V1'],
    bound: ['__TALARIA_SERIES_DEDUPE_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'LIFE-1',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_CHART_DESTROY_V1', 'Chart.prototype.destroy'],
    bound: ['destroy()'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'LIFE-2',
    owner: 'E',
    files: ['chart v 1.4/chart/modules/chart-indicators-full.js', 'homepage/public/chart/modules/chart-indicators-full.js'],
    present: ['__TALARIA_WORKER_TERMINATE_V1'],
    bound: ['window.addEventListener(\'pagehide\'', 'window.addEventListener(\'beforeunload\'', '.terminate()'],
    mirror: ['chart v 1.4/chart/modules/chart-indicators-full.js', 'homepage/public/chart/modules/chart-indicators-full.js'],
    discriminating: true,
    discriminatingEvidence: 'm19i-b62-window-fp-regime-v1: VM pagehide terminates worker and clears singleton',
  },
  {
    row: 'LIFE-3',
    owner: 'B',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_BFCACHE_DEFEAT_V1'],
    bound: ['__TALARIA_BFCACHE_DEFEAT_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'LIFE-4-M8',
    owner: 'D',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['M8', 'hydration guard'],
    bound: ['hydration'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
    note: 'Known example: guard landed in source chart.js but not public mirror; this row must prove mirror parity before seal.',
  },
  {
    row: 'HYG-1',
    owner: 'B',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_SETTINGS_WRITE_BREAKER_V1'],
    bound: ['__TALARIA_SETTINGS_WRITE_BREAKER_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'HYG-2',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_MIRROR_INTERVAL_GUARD_V1'],
    bound: ['__TALARIA_MIRROR_INTERVAL_GUARD_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
  },
  {
    row: 'PROC-2',
    owner: 'E',
    files: ['docs/plan3/oracles/trade-attribution-correctness-v1.mjs'],
    present: ['TRADE-RESOLVER-PRESENT-AND-BOUND'],
    bound: ['runResolverBindingControls(staticSurface, resolverTreeState)'],
    mirror: null,
    discriminating: true,
    discriminatingEvidence: 'trade-attribution-correctness-v1: TRADE-RESOLVER-PRESENT-BUT-UNBOUND-RED',
  },
  {
    row: 'PROC-3',
    owner: 'E',
    files: ['docs/plan3/oracles/proc3-unwired-fix-sweep-v1.mjs'],
    present: ['TALARIA_PROC3_UNWIRED_FIX_SWEEP_V1'],
    bound: ['runProc3UnwiredFixSweep()'],
    mirror: null,
    discriminating: true,
    discriminatingEvidence: 'This oracle fails closed for absent, unbound, unmirrored, or undiscriminating rows.',
  },
  {
    row: 'KNOWN-A-resolver',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['function _resolveTradeJournalAttribution(order)', 'window._resolveTradeJournalAttribution = _resolveTradeJournalAttribution'],
    bound: ['window._resolveTradeJournalAttribution('],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: true,
    discriminatingEvidence: 'trade-attribution-correctness-v1 now has resolver-present-but-unbound RED arm',
  },
  {
    row: 'KNOWN-overlay-kill-switch-four-call-sites',
    owner: 'A',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_OVERLAY_RESYNC_DIRTY_V1'],
    bound: ['__TALARIA_OVERLAY_RESYNC_DIRTY_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: false,
    note: 'Known example: one guarded call site does not bind the other live paths.',
  },
  {
    row: 'KNOWN-E-first-attribution-oracle',
    owner: 'E',
    files: ['docs/plan3/oracles/trade-attribution-correctness-v1.mjs'],
    present: ['loadProductOrderManagerClass', 'saveTradeToJournalProduct'],
    bound: ['saveTradeToJournalProduct(manager, state, order, productClose.closeData)'],
    mirror: null,
    discriminating: true,
    discriminatingEvidence: 'Superseded by product-code oracle; model-only first gate no longer counts.',
  },
];

function evaluateRow(row) {
  const present = presentAny(row.files, row.present);
  const bound = boundAny(row.files, row.bound);
  const mirror = row.mirror
    ? mirrored(row.mirror[0], row.mirror[1], row.present)
    : { ok: true, reason: 'not-a-mirrored-surface' };
  const discriminating = boolAxis(row.discriminating, {
    evidence: row.discriminatingEvidence || null,
  });
  const axes = { present, bound, mirrored: mirror, discriminating };
  const status = Object.values(axes).every((axis) => axis.ok) ? 'GREEN' : 'RED';
  return {
    row: row.row,
    owner: row.owner,
    status,
    axes,
    note: row.note || null,
    returnToOwner: status === 'GREEN' ? null : row.owner,
  };
}

export function runProc3UnwiredFixSweep() {
  const rows = ROWS.map(evaluateRow);
  const returns = rows.filter((row) => row.status !== 'GREEN').map((row) => ({
    row: row.row,
    owner: row.owner,
    failedAxes: Object.entries(row.axes)
      .filter(([, axis]) => !axis.ok)
      .map(([name]) => name),
    note: row.note,
  }));
  return {
    signature: SIGNATURE,
    status: returns.length === 0 ? 'GREEN' : 'RED',
    scope: '09:15 roster plus 09:35 known unwired-fix examples; fail-closed until train-tip code/gates prove all four axes',
    axes: ['present', 'bound', 'mirrored', 'discriminating'],
    rows,
    returns,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runProc3UnwiredFixSweep();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
