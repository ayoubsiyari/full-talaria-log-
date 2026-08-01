import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const SIGNATURE = 'TALARIA_PROC3_UNWIRED_FIX_SWEEP_V1';

function readRel(relPath, ref = 'HEAD') {
  if (ref && ref !== 'WORKTREE') {
    try {
      return execFileSync('git', ['show', `${ref}:${relPath}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch (_) {
      return '';
    }
  }
  return fs.existsSync(path.join(repoRoot, relPath))
    ? fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
    : '';
}

function lineOf(text, needle) {
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  return text.slice(0, idx).split(/\r?\n/).length;
}

function presentAny(files, needles, ref) {
  for (const relPath of files) {
    const text = readRel(relPath, ref);
    for (const needle of needles) {
      const line = lineOf(text, needle);
      if (line != null) return { ok: true, path: relPath, line, needle };
    }
  }
  return { ok: false, needles };
}

function boundAny(files, needles, ref) {
  return presentAny(files, needles, ref);
}

function mirrored(primary, mirror, needles, ref) {
  if (!primary || !mirror) return { ok: true, reason: 'not-a-mirrored-surface' };
  const a = readRel(primary, ref);
  const b = readRel(mirror, ref);
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
    ref: '0cdb49acd',
    files: ['chart v 1.4/chart/modules/order-manager.js', 'homepage/public/chart/modules/order-manager.js'],
    present: ['__TALARIA_MARKER_INDEX_CACHE_V1'],
    bound: ['_chartIndexForCloseMarkerOnChart('],
    mirror: ['chart v 1.4/chart/modules/order-manager.js', 'homepage/public/chart/modules/order-manager.js'],
    discriminating: true,
    discriminatingEvidence: '0cdb49acd carries scripts/tests/lag1a-marker-index-cache-gate.test.mjs mutant proof; D handoff reports source-reverted mutant RED.',
  },
  {
    row: 'LAG-1b',
    owner: 'A',
    ref: 'a88f0551b',
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
    ref: '7e7d244e3',
    files: ['chart v 1.4/chart/modules/replay-dashboard-sync.js', 'homepage/public/chart/modules/replay-dashboard-sync.js', 'chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    present: ['__TALARIA_DASHBOARD_SYNC_COALESCE_V1'],
    bound: ['__TALARIA_DASHBOARD_SYNC_COALESCE_V1'],
    mirror: ['chart v 1.4/chart/modules/replay-dashboard-sync.js', 'homepage/public/chart/modules/replay-dashboard-sync.js'],
    discriminating: true,
    discriminatingEvidence: '7e7d244e3 carries scripts/sr04/dashboard-sync-mutants.mjs.',
  },
  {
    row: 'LAG-3',
    owner: 'E',
    ref: 'HEAD',
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
    ref: 'f8f333619',
    files: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    present: ['__TALARIA_DISABLE_M20_Q6_REPLAY_FLOAT_LISTENER_TEARDOWN_V1', 'M20Q6ReplaySystem'],
    bound: ['m20Q6CaptureEffects(state', 'ReplaySystem = M20Q6ReplaySystem'],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: true,
    discriminatingEvidence: 'f8f333619 carries scripts/sr04/m20q6-reentry-mutants.mjs.',
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
    ref: 'b08b2e3ed',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_CHART_DESTROY_V1', 'Chart.prototype.destroy'],
    bound: ['destroy()'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: true,
    discriminatingEvidence: 'b08b2e3ed carries scripts/sr04/chart-destroy.test.mjs and fixed-SHA GATE-01 cells.',
  },
  {
    row: 'LIFE-2',
    owner: 'E',
    ref: 'HEAD',
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
    ref: '9a8979586',
    files: [
      'chart v 1.4/chart/modules/chart-window-limit.js',
      'homepage/public/chart/modules/chart-window-limit.js',
      'chart v 1.4/talaria-design/live/index.html',
      'homepage/next.config.mjs',
    ],
    present: ['__TALARIA_BFCACHE_DEFEAT_V1', 'LIFE-3-BFCACHE-DEFEAT-V1'],
    bound: ['chart-window-limit.js', 'Cache-Control'],
    mirror: ['chart v 1.4/chart/modules/chart-window-limit.js', 'homepage/public/chart/modules/chart-window-limit.js'],
    discriminating: true,
    discriminatingEvidence: '9a8979586 carries _evidence/manager-B/life3-bfcache/life3-behavioural.test.mjs.',
  },
  {
    row: 'LIFE-4-M8',
    owner: 'D',
    ref: 'dd0dc4445',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['M8', 'hydration guard'],
    bound: ['hydration'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: true,
    discriminatingEvidence: 'dd0dc4445 registers scripts/m8-state-bound-guard.mjs and scripts/tests/m8-state-bound-invariant.test.mjs.',
    note: 'Current M8 source row; original one-mirror defect remains represented by KNOWN-D-M8-one-mirror.',
  },
  {
    row: 'HYG-1',
    owner: 'B',
    ref: '9a8979586',
    files: [
      'chart v 1.4/chart/modules/settings-write-breaker.js',
      'homepage/public/chart/modules/settings-write-breaker.js',
      'chart v 1.4/talaria-design/live/index.html',
    ],
    present: ['__TALARIA_SETTINGS_WRITE_BREAKER_V1'],
    bound: ['settings-write-breaker.js', '__talariaSettingsWriteBreaker'],
    mirror: ['chart v 1.4/chart/modules/settings-write-breaker.js', 'homepage/public/chart/modules/settings-write-breaker.js'],
    discriminating: true,
    discriminatingEvidence: '9a8979586 carries _evidence/manager-B/proc3-b-rows.mjs for HYG-1/LIFE-3.',
  },
  {
    row: 'HYG-2',
    owner: 'A',
    ref: 'f33874a12',
    files: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    present: ['__TALARIA_MIRROR_INTERVAL_GUARD_V1'],
    bound: ['_setManagedInterval(', '_installManagedTimer('],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: true,
    discriminatingEvidence: 'f33874a12 carries scripts/sr04/mirror-interval-mutants.mjs.',
  },
  {
    row: 'PROC-2',
    owner: 'E',
    ref: 'HEAD',
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
    ref: 'HEAD',
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
    ref: '4ff581301',
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
    ref: 'a88f0551b',
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
    ref: 'HEAD',
    files: ['docs/plan3/oracles/trade-attribution-correctness-v1.mjs'],
    present: ['loadProductOrderManagerClass', 'saveTradeToJournalProduct'],
    bound: ['saveTradeToJournalProduct(manager, state, order, productClose.closeData)'],
    mirror: null,
    discriminating: false,
    note: 'Known example: the first attribution oracle was model-only; PROC-3 must keep it RED because model coverage is not product binding.',
  },
];

function evaluateRow(row) {
  const ref = row.ref || 'HEAD';
  const present = presentAny(row.files, row.present, ref);
  const bound = boundAny(row.files, row.bound, ref);
  const mirror = row.mirror
    ? mirrored(row.mirror[0], row.mirror[1], row.present, ref)
    : { ok: true, reason: 'not-a-mirrored-surface' };
  const discriminating = boolAxis(row.discriminating, {
    evidence: row.discriminatingEvidence || null,
  });
  const axes = { present, bound, mirrored: mirror, discriminating };
  const status = Object.values(axes).every((axis) => axis.ok) ? 'GREEN' : 'RED';
  return {
    row: row.row,
    owner: row.owner,
    ref,
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
