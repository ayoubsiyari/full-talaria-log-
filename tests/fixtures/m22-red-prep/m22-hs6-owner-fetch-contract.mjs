/**
 * M22 / H-S6 — host TF fan-out owner-fetch defect contract + future hunk manifest.
 *
 * STATUS: RED-PREP-ONLY-M21-1-LOCKED
 * Audit: db9ddd96 — `_applyFinerPanelHostCommit` lets peers still at 1m enter
 * finer-self-own while host interval fan-out moves to 1h → A/B/C/D all fetch.
 *
 * NO edits to chart.js, scenarios.mjs, known-failing.json, panel-cmd-bridge,
 * sync-bridge, W5/W6, or existing product/tests. M21-1 owns chart.js.
 *
 * Run RED cells:
 *   node "chart v 1.4/chart/modules/m22-hs6-owner-fetch-runner.mjs"
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m22-hs6-owner-fetch.red.test.mjs"
 */

export const M22_HS6_HANDOFF_MARKER = '__M22_HS6_HANDOFF_JSON__';
export const M22_HS6_STATUS = 'RED-PREP-ONLY-M21-1-LOCKED';
export const M22_HS6_AUDIT_REF = 'db9ddd96';

/** Default-ON future fix: unset/false => guard active; true => legacy storm. */
export const M22_HS6_KILL_SWITCH = '__TALARIA_MC_DISABLE_HOST_FANOUT_FINER_SELFOWN_GUARD';

export const M22_HS6_SCENARIO = Object.freeze({
  id: 'H-S6',
  title: 'TF fan-out 1m→1h→1m same-pair 4-panel interval-sync ON',
  panels: Object.freeze(['A', 'B', 'C', 'D']),
  ownerPanel: 'A',
  peerPanels: Object.freeze(['B', 'C', 'D']),
  boot: Object.freeze({ pair: 'same', panels: 4, tf: '1m', syncOn: true }),
});

/** Intended GREEN invariants (future; not claimed today). */
export const M22_HS6_GREEN_INVARIANTS = Object.freeze({
  fanOut1mTo1h: Object.freeze({
    ownerPanelFetchMax: 1,
    ownerPanelId: 'A',
    peerFetchMax: 0,
    peerIds: Object.freeze(['B', 'C', 'D']),
    targetTfNetworkRequests: 1,
    targetTf: '1h',
    endpoints: Object.freeze(['file.bars', 'file.smart', 'file.candles']),
  }),
  fanOut1hTo1mCached: Object.freeze({
    ownerPanelFetchMax: 1,
    peerFetchMax: 0,
    targetTfNetworkRequests: 0,
    targetTf: '1m',
    note: '1m already warm in BT cache — zero network preferred; ≤1 owner refetch tolerated',
  }),
});

/** Known RED signature on current product (both trees, clean HEAD chart.js). */
export const M22_HS6_RED_SIGNATURE = Object.freeze({
  fanOut1mTo1h: Object.freeze({
    minPanelsThatFetched: 4,
    expectedPanelsThatFetched: Object.freeze(['A', 'B', 'C', 'D']),
    minPeerFinerSelfOwnCount: 3,
    /** Host/owner issues the single 1h target-TF request; peers wrongly self-fetch at finer 1m smart. */
    minTargetTf1hNetworkRequests: 1,
    minPeerFiner1mSmartRequests: 3,
    minTotalDataNetworkRequests: 4,
    defectClass: 'host-fanout-finer-selfown-race',
    rootCause: '_applyFinerPanelHostCommit + _multichartFinerSamePairPanelSelfOwns while peers lag host TF during __fromHostFanout interval sync',
  }),
  fanOut1hTo1m: Object.freeze({
    maxPanelsThatFetched: 1,
    note: 'cached 1m path currently passes — preserve on GREEN',
  }),
});

export function m22Hs6HostFanoutFinerSelfOwnGuardEnabled(scope = globalThis) {
  try {
    return !(scope && scope[M22_HS6_KILL_SWITCH] === true);
  } catch (_) {
    return true;
  }
}

export function switchOffRestoresLegacyFanoutStorm(scope = globalThis) {
  return m22Hs6HostFanoutFinerSelfOwnGuardEnabled(scope) === false;
}

/**
 * Required future GREEN suite (post M21-1 chart.js land).
 * Listed for worker handoff — not executed by this RED-prep lane except H-S6 probe.
 */
export const M22_HS6_REQUIRED_GREEN_SUITE = Object.freeze([
  { id: 'H-S6', scope: 'primary owner-fetch fan-out 1m→1h→1m' },
  { id: 'H-S64', scope: 'host TF mirror-wait — ≤1 owner fetch on fan-out' },
  { id: 'H-S21', scope: 'BL-15 legitimate panel-initiated finer self-own (sanctioned owner path)' },
  { id: 'H-S23', scope: 'BL-17 finer self-own replay catch-up' },
  { id: 'H-S7', scope: 'interval switch panel-B-only with sync OFF' },
  { id: 'H-S24', scope: 'host own-switch fan-out finer mirror (D-046 / BL-18)' },
  { id: 'cache-no-cache', scope: '1h→1m cached vs cold cache miss (≤1 owner only)' },
  { id: 'same-different-pair', scope: 'same-pair vs independent-pair file isolation' },
  { id: 'replay-static-live', scope: 'static boot, paused replay, playing replay during fan-out' },
  { id: 'delayed-reordered-host-commit', scope: 'host commit reordered / delayed vs peer setTimeframe' },
  { id: '4-panel-network-count', scope: 'serve.mjs api log — exactly one target-TF data request on fan-out' },
  { id: 'kill-switch-OFF', scope: '__TALARIA_MC_DISABLE_HOST_FANOUT_FINER_SELFOWN_GUARD=true restores legacy A/B/C/D storm for discrimination' },
  { id: 'Q1-Q2-Q8', scope: 'multichart ownership regressions (Phase-4 matrix rows)' },
  { id: 'M21-1', scope: 'render/runtime regressions after chart.js owner lane lands' },
]);

/**
 * Future product hunk — LIMITED to `_applyFinerPanelHostCommit` and indispensable
 * helper context in chart.js. Must distinguish host interval fan-out
 * (`_mcIntervalSyncOn` / target host TF / `__fromHostFanout`) from legitimate
 * panel-initiated finer self-ownership (BL-15 / H-S21 / H-S23). No blanket disable.
 */
export const M22_HS6_HUNK_MANIFEST = Object.freeze([
  {
    id: 'HS6-H1',
    file: 'chart v 1.4/chart/chart.js',
    title: 'Kill-switch accessor + host-fanout finer-selfown guard predicate',
    anchors: ['near _finerPanelSelfOwnDisabled (~L4010)', '_applyFinerPanelHostCommit (~L4241)'],
    change: [
      'Add _m22Hs6HostFanoutFinerSelfOwnGuardEnabled() reading __TALARIA_MC_DISABLE_HOST_FANOUT_FINER_SELFOWN_GUARD (default ON when unset)',
      'Add _m22Hs6ShouldDeclineFinerSelfOwnDuringHostFanout(detail) — true when embed panel, same-pair, _mcIntervalSyncOn, host commit TF matches interval-sync target, panel TF still coarser than commit native (transient fan-out race), NOT panel-initiated BL-15/H-S21/H-S23',
      'Predicate reads detail.timeframe / detail.nativeRawFetchTf / _mcCommittedTimeframe; ignores independent-pair',
    ],
  },
  {
    id: 'HS6-H2',
    file: 'chart v 1.4/chart/chart.js',
    title: 'Wire guard into _applyFinerPanelHostCommit only',
    anchors: ['_applyFinerPanelHostCommit (~L4241–4276)'],
    change: [
      'Before _multichartFinerSamePairPanelSelfOwns(detail) → _setFinerPanelSelfOwnerMode(true): if guard enabled AND _m22Hs6ShouldDeclineFinerSelfOwnDuringHostFanout(detail), skip finer-self-own entry; fall through to mirror/_takeParentMemorySmartWindow path',
      'Do NOT disable _multichartFinerSamePairPanelSelfOwns globally',
      'Do NOT alter panel-initiated setTimeframe without __fromHostFanout',
      'Kill path (switch ON/true): restore today\'s race (RED signature) for discrimination',
    ],
  },
  {
    id: 'HS6-H3',
    file: 'chart v 1.4/chart/chart.js',
    title: 'Optional helper: committed host state for fan-out target TF',
    anchors: ['_readCommittedHostStateForFinerOwner (~L3990)'],
    change: [
      'Only if H1 predicate cannot be expressed cleanly — extend detail normalization to expose host fan-out target TF vs panel lag TF',
      'Skip if H1 suffices with existing detail fields',
    ],
    optional: true,
  },
  {
    id: 'HS6-H4',
    file: 'homepage/public/chart/chart.js',
    title: 'Dual-tree byte-identical mirror of H1–H3',
    anchors: ['same symbols'],
    change: ['Mirror chart.js regions after v14 GREEN'],
  },
  {
    id: 'HS6-H5',
    file: 'chart v 1.4/chart/modules/m22-hs6-owner-fetch.red.test.mjs',
    title: 'Flip meta+oracle RED→GREEN; add kill-switch discrimination cell',
    anchors: ['this prep lane'],
    change: [
      'Product oracle exits 0 on both trees when guard lands',
      'Legacy switch-OFF cell reproduces A/B/C/D storm',
      'Write docs/plan3/evidence/M22-H-S6-OWNER-FETCH-GREEN.json',
    ],
  },
]);

export const M22_HS6_FORBIDDEN_EDITS = Object.freeze([
  'chart v 1.4/chart/chart.js (until M21-1 releases)',
  'homepage/public/chart/chart.js (until M21-1 releases)',
  'chart v 1.4/chart/multichart-prod/harness/scenarios.mjs',
  'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js',
  'chart v 1.4/chart/multichart-prod/sync-bridge.js',
  'known-failing.json',
  'W5/W6 fixtures and existing product/tests',
]);

/** Executable spec: panels whose diag.fetches increased. */
export function panelsThatFetched(before, after, ids) {
  const list = [];
  for (const id of ids) {
    const b = (before[id] && before[id].fetches) || 0;
    const a = (after[id] && after[id].fetches) || 0;
    if (a > b) list.push(id);
  }
  return list;
}

export function panelFetchDeltas(before, after, ids) {
  const out = {};
  for (const id of ids) {
    const b = (before[id] && before[id].fetches) || 0;
    const a = (after[id] && after[id].fetches) || 0;
    out[id] = a - b;
  }
  return out;
}

const DATA_ENDPOINTS = new Set(['file.bars', 'file.smart', 'file.candles']);

export function countTargetTfDataRequests(apiLog, targetTf) {
  let n = 0;
  for (const e of apiLog || []) {
    if (!DATA_ENDPOINTS.has(e.endpoint)) continue;
    const qTf = String(e.query?.timeframe || e.query?.resolution || e.query?.tf || '').toLowerCase();
    if (qTf === targetTf) {
      n += 1;
      continue;
    }
    if (targetTf === '1h' && (qTf === '60' || qTf === '60m')) n += 1;
    if (targetTf === '1m' && (qTf === '1' || qTf === '1min')) n += 1;
  }
  return n;
}

export function countEndpointTfRequests(apiLog, endpoint, tf) {
  let n = 0;
  for (const e of apiLog || []) {
    if (e.endpoint !== endpoint) continue;
    const qTf = String(e.query?.timeframe || e.query?.resolution || e.query?.tf || '').toLowerCase();
    if (qTf === tf) n += 1;
  }
  return n;
}

export function totalDataFetches(apiLog) {
  return (apiLog || []).filter((e) => DATA_ENDPOINTS.has(e.endpoint)).length;
}
