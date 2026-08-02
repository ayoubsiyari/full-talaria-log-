import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const SIGNATURE = 'TALARIA_PROC3_UNWIRED_FIX_SWEEP_V1';
const FILE_INTEGRITY_REF = process.env.PROC3_FILE_INTEGRITY_REF
  || process.env.PROC3_INTEGRATED_REF
  || 'HEAD';
const PRODUCT_FILE_INTEGRITY_PAIRS = [
  {
    id: 'chart-js-mirrors',
    primary: 'chart v 1.4/chart/chart.js',
    mirror: 'homepage/public/chart/chart.js',
    minLines: 40000,
  },
  {
    id: 'order-manager-js-mirrors',
    primary: 'chart v 1.4/chart/modules/order-manager.js',
    mirror: 'homepage/public/chart/modules/order-manager.js',
    minLines: 48000,
  },
  {
    id: 'chart-indicators-full-js-mirrors',
    primary: 'chart v 1.4/chart/modules/chart-indicators-full.js',
    mirror: 'homepage/public/chart/modules/chart-indicators-full.js',
    minLines: 20000,
  },
  {
    id: 'replay-system-js-mirrors',
    primary: 'chart v 1.4/chart/modules/replay-system.js',
    mirror: 'homepage/public/chart/modules/replay-system.js',
    minLines: 9000,
  },
];
const FILE_INTEGRITY_NEUTERED_GUARDS = [
  {
    id: 'if-false-and-guard-neuter',
    pattern: /\bif\s*\(\s*false\s*&&/,
  },
  {
    id: 'return-true-short-circuit-neuter',
    pattern: /\breturn\s+true\s*;\s*(?:(?:\/\/|\/\*)[^\n]*)?(?:short[- ]?circuit|neuter|mutant|bypass|guard disabled|guard neuter)/i,
  },
];
const fileIntegrityCache = new Map();

function readRel(relPath, ref = 'HEAD') {
  if (ref && ref !== 'WORKTREE') {
    try {
      return execFileSync('git', ['show', `${ref}:${relPath}`], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024,
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

function lineOfRegex(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  return text.slice(0, match.index).split(/\r?\n/).length;
}

function lineCount(text) {
  return text.split(/\r?\n/).length;
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

function noMutationArtifacts(files, artifacts = [], ref) {
  if (!artifacts.length) return { ok: true, reason: 'no-row-specific-product-mutation-artifacts' };
  const hits = [];
  for (const relPath of files) {
    const text = readRel(relPath, ref);
    if (!text) continue;
    for (const artifact of artifacts) {
      if (text.includes(artifact.needle)) {
        hits.push({ id: artifact.id, path: relPath, needle: artifact.needle });
      }
    }
  }
  return { ok: hits.length === 0, hits };
}

function fileIntegrity(ref = FILE_INTEGRITY_REF) {
  if (fileIntegrityCache.has(ref)) return fileIntegrityCache.get(ref);
  const hits = [];
  const checked = [];
  for (const pair of PRODUCT_FILE_INTEGRITY_PAIRS) {
    const primaryText = readRel(pair.primary, ref);
    const mirrorText = readRel(pair.mirror, ref);
    const files = [
      { role: 'primary', path: pair.primary, text: primaryText },
      { role: 'mirror', path: pair.mirror, text: mirrorText },
    ];
    for (const file of files) {
      checked.push(file.path);
      if (!file.text) {
        hits.push({ id: 'file-missing', pair: pair.id, path: file.path, ref });
        continue;
      }
      const lines = lineCount(file.text);
      if (lines < pair.minLines) {
        hits.push({
          id: 'line-count-below-sanity-floor',
          pair: pair.id,
          path: file.path,
          ref,
          lines,
          minLines: pair.minLines,
        });
      }
      try {
        new vm.Script(file.text, { filename: file.path });
      } catch (error) {
        hits.push({
          id: 'parse-failed',
          pair: pair.id,
          path: file.path,
          ref,
          message: error && error.message ? error.message : String(error),
        });
      }
      for (const guard of FILE_INTEGRITY_NEUTERED_GUARDS) {
        const line = lineOfRegex(file.text, guard.pattern);
        if (line != null) {
          hits.push({
            id: guard.id,
            pair: pair.id,
            path: file.path,
            ref,
            line,
          });
        }
      }
    }
    if (primaryText && mirrorText) {
      const primaryLines = lineCount(primaryText);
      const mirrorLines = lineCount(mirrorText);
      if (primaryLines !== mirrorLines) {
        hits.push({
          id: 'mirror-line-count-mismatch',
          pair: pair.id,
          ref,
          primary: pair.primary,
          mirror: pair.mirror,
          primaryLines,
          mirrorLines,
        });
      }
    }
  }
  const result = {
    ok: hits.length === 0,
    ref,
    checked: [...new Set(checked)],
    minLineFloors: PRODUCT_FILE_INTEGRITY_PAIRS.map(({ id, minLines }) => ({ id, minLines })),
    hits,
  };
  fileIntegrityCache.set(ref, result);
  return result;
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
    ref: '13cc48890',
    files: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    present: ['__TALARIA_OVERLAY_RESYNC_DIRTY_V1'],
    bound: ['__TALARIA_OVERLAY_RESYNC_DIRTY_V1'],
    mirror: ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js'],
    discriminating: true,
    discriminatingEvidence: '13cc48890 adds C13 in-memory neutering cells; gate goes RED when the fix is inert/reverted while the suite remains present.',
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
    ref: '50b5a3867',
    files: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    present: ['__TALARIA_EVICT_BEHIND_PLAYHEAD_V1'],
    bound: ['_evictBehindPlayhead()', '_evictBehindPlayheadDisabled()'],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: true,
    discriminatingEvidence: '50b5a3867 restores the primary mirror and carries scripts/sr04/evict-behind-playhead.test.mjs and evict-behind-playhead-mutants.mjs.',
    mutationArtifacts: [
      {
        id: 'MEM-1a-inverted-kill-switch',
        needle: "return !_talariaDisableFlagTruthy('__TALARIA_EVICT_BEHIND_PLAYHEAD_V1');",
      },
      {
        id: 'MEM-1a-slack-threshold-removed',
        needle: 'if (start < 1) return;',
      },
    ],
  },
  {
    row: 'MEM-1b',
    owner: 'A',
    ref: '0c458b1a1',
    files: ['chart v 1.4/chart/modules/order-manager.js', 'homepage/public/chart/modules/order-manager.js'],
    present: ['__TALARIA_SERIES_LRU_V1'],
    bound: ['_capOrderExecutionSeriesPerFile(perFile)', '_retainCurrentOrderExecutionSeries()'],
    mirror: ['chart v 1.4/chart/modules/order-manager.js', 'homepage/public/chart/modules/order-manager.js'],
    discriminating: true,
    discriminatingEvidence: '0c458b1a1 carries scripts/sr04/series-lru-caps.test.mjs 11/11 with GATE-01 pinned to 13cc48890.',
  },
  {
    row: 'MEM-1c',
    owner: 'A',
    ref: 'ca5b82b7b',
    files: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    present: ['__TALARIA_PRESESSION_RESIDENCY_V1'],
    bound: ['PRESESSION_RESIDENCY_BARS', 'bound pre-session history at replay entry'],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: true,
    discriminatingEvidence: 'ca5b82b7b carries scripts/sr04/presession-residency.test.mjs 17/17 plus EVICT-03 regression cells.',
  },
  {
    row: 'MEM-1d',
    owner: 'A',
    ref: 'db8d57ae0',
    files: [
      'chart v 1.4/chart/modules/replay-system.js',
      'homepage/public/chart/modules/replay-system.js',
      'scripts/sr04/series-dedupe.test.mjs',
      'docs/plan3/MEM-1d-consumer-audit.md',
    ],
    present: ['__TALARIA_SERIES_DEDUPE_V1'],
    bound: ['R1 AUDIT: fullData still has no product reader', 'Positive control'],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: true,
    discriminatingEvidence: 'db8d57ae0 carries scripts/sr04/series-dedupe.test.mjs 12/12; R1 re-runs the live product scan and includes positive controls.',
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
    row: 'ATTRIB-A-live',
    owner: 'A',
    ref: '50b5a3867',
    files: [
      'chart v 1.4/chart/modules/order-manager.js',
      'homepage/public/chart/modules/order-manager.js',
      'chart v 1.4/chart/modules/trade-attribution.js',
      'chart v 1.4/chart/multichart-prod/chart-embed.html',
      'homepage/public/chart/multichart-prod/chart-embed.html',
    ],
    present: [
      'function _resolveTradeJournalAttribution(order, chartSource)',
      'window.TalariaTradeAttribution',
      '/chart/modules/trade-attribution.js',
    ],
    bound: [
      'window.TalariaTradeAttribution',
      '_resolveJournalContextChart(order)',
      '/chart/modules/trade-attribution.js',
    ],
    mirror: ['chart v 1.4/chart/modules/order-manager.js', 'homepage/public/chart/modules/order-manager.js'],
    discriminating: true,
    discriminatingEvidence: '50b5a3867 carries scripts/sr04/journal-attribution-call-site.test.mjs C10/C11/C12 and trade-attribution-resolver.test.mjs.',
  },
  // Added by B (integration) 2026-08-02. E landed two rows after the 09:15 roster was
  // frozen, so a GREEN sweep said nothing about them — they were inheriting a
  // no-regression result rather than earning a pass. Both are on the seal tip, so both
  // are swept here. Their axes are recorded as measured, not as claimed: `discriminating`
  // is false on both, and that is the finding rather than a bookkeeping gap.
  {
    row: 'E-FORMING-A8',
    owner: 'E',
    ref: 'HEAD',
    files: [
      'chart v 1.4/chart/modules/replay-system.js',
      'homepage/public/chart/modules/replay-system.js',
      'chart v 1.4/chart/chart.js',
      'homepage/public/chart/chart.js',
    ],
    present: ['__talariaFormingSim', '_deriveStepClockFormingCandle', 'skipToBarClose('],
    bound: ['this._deriveStepClockFormingCandle(target, ticksNeeded)'],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: false,
    discriminatingEvidence: 'RED on the discriminating axis, measured not assumed. forming-renderer-step-clock.test.mjs is 6/6, but every cell is assert.match(source, /regex/) against lifted method text — the gate never executes the product, so it cannot go RED on a helper that returns wrong numbers. Demonstrated rather than argued: the gate stays 6/6 on a tip where B reproduced a live cachedPath clobber reaching this row (_evidence/manager-B/review/e-waypoint-cachedpath-alias-probe.mjs). Needs one executing cell that goes RED when _deriveStepClockFormingCandle is inert or wrong.',
  },
  {
    row: 'E-WAYPOINT-PATH',
    owner: 'E',
    ref: 'HEAD',
    files: [
      'chart v 1.4/chart/modules/replay-system.js',
      'homepage/public/chart/modules/replay-system.js',
    ],
    present: ['_pathWaypointScratch', '_tickPathScratch', '__TALARIA_DISABLE_M19_TICK_PATH_BOUND_V1'],
    bound: ['this.generatePath(candle, n)'],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: true,
    discriminatingEvidence: 'CLOSED at f3ecb494f, upgraded from RED. B first marked this row RED: the suite executed the product but its only mutant proved the generator does not reach order-resolution state, and it was green on a tip where a retained cachedPath was provably rewritten in place. E then added three A4 cells that assert the retained head value is unchanged after transient, independent-pair and aggregate generation, each with its own anti-vacuity control, plus a static sweep that no retain site takes the shared scratch. These are discriminating against the real defect rather than by assertion: B measured the pre-fix retained head moving 100 -> 200, which is exactly the equality the new cells check, so the reverted code fails them. Independently re-verified by _evidence/manager-B/review/e-waypoint-cachedpath-alias-probe.mjs, 5/5 with its anti-vacuity cell passing.',
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
    row: 'KNOWN-MEM-1a-mutant-artifact',
    owner: 'A',
    ref: '41c34d1ea',
    files: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    present: ['__TALARIA_EVICT_BEHIND_PLAYHEAD_V1'],
    bound: ['_evictBehindPlayhead()', '_evictBehindPlayheadDisabled()'],
    mirror: ['chart v 1.4/chart/modules/replay-system.js', 'homepage/public/chart/modules/replay-system.js'],
    discriminating: true,
    discriminatingEvidence: 'Known bad MEM-1a product commit; fifth axis must catch the mutant artifact even when the original four axes look wired.',
    mutationArtifacts: [
      {
        id: 'MEM-1a-inverted-kill-switch',
        needle: "return !_talariaDisableFlagTruthy('__TALARIA_EVICT_BEHIND_PLAYHEAD_V1');",
      },
      {
        id: 'MEM-1a-slack-threshold-removed',
        needle: 'if (start < 1) return;',
      },
    ],
    note: 'Known example: 41c34d1ea shipped a mutation artifact into the primary product file.',
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
  const mutationArtifact = noMutationArtifacts(row.files, row.mutationArtifacts, ref);
  const integrity = fileIntegrity();
  const axes = { present, bound, mirrored: mirror, discriminating, mutationArtifact, fileIntegrity: integrity };
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
    scope: '09:15 roster plus known unwired/mutation examples; fail-closed until train-tip code/gates prove all six axes',
    axes: ['present', 'bound', 'mirrored', 'discriminating', 'mutationArtifact', 'fileIntegrity'],
    rows,
    returns,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runProc3UnwiredFixSweep();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
