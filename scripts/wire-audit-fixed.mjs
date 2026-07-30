#!/usr/bin/env node
/**
 * TEST-01 / generalised D3 — wire-audit every ledger `fixed` row against a
 * deployed stamp's module bytes (or a local artifact dir).
 *
 * Usage:
 *   node scripts/wire-audit-fixed.mjs --wire-dir artifacts/wire-b113 --stamp 20260730b113
 *   node scripts/wire-audit-fixed.mjs --base http://31.97.192.82:3000 --stamp 20260730b113
 *
 * Emits JSON to stdout; write with shell redirect for EVID-01 artifact.
 */
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const stamp = arg('--stamp', 'unknown');
const wireDir = arg('--wire-dir', resolve(root, 'artifacts', `wire-${stamp}`));
const base = arg('--base', null);
const outPath = arg('--out', resolve(root, 'docs/plan3', `WIRE-AUDIT-FIXED-${stamp}.json`));

const PATH_HINTS = [
  { hint: 'order-manager.js', local: 'chart v 1.4/chart/modules/order-manager.js', wireNames: ['chart_modules_order-manager.js', 'order-manager.js'] },
  { hint: 'chart.js', local: 'chart v 1.4/chart/chart.js', wireNames: ['chart_chart.js', 'chart.js'] },
  { hint: 'replay-system.js', local: 'chart v 1.4/chart/modules/replay-system.js', wireNames: ['chart_modules_replay-system.js', 'replay-system.js'] },
  { hint: 'orderManagerTradeRows.js', local: 'chart v 1.4/talaria-design/src/orderManagerTradeRows.js', wireNames: ['chart_talaria-design_src_orderManagerTradeRows.js', 'orderManagerTradeRows.js'] },
  { hint: 'drawing-tools-manager.js', local: 'chart v 1.4/chart/modules/drawing-tools-manager.js', wireNames: ['chart_modules_drawing-tools-manager.js', 'drawing-tools-manager.js'] },
  { hint: 'session_journal_store.py', local: 'chart v 1.4/chart/session_journal_store.py', wireNames: [] }, // backend — wire via API not static
  { hint: 'multichart-manager.js', local: 'chart v 1.4/chart/multichart-prod/multichart-manager.js', wireNames: ['chart_multichart-prod_multichart-manager.js'] },
];

const GATE_TO_MARKERS = {
  'm24-order-id-restore-stability': [{ hint: 'order-manager.js', needle: '_resolveJournalDisplayTradeId' }, { hint: 'order-manager.js', needle: '__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1' }],
  'm24-order-id-gap-after-hydrate': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1' }, { hint: 'order-manager.js', needle: '_m24ReconcileOrderIdCounter' }],
  'm24-order-id-allocator': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_M24_ORDER_ID_ALLOCATOR_V1' }, { hint: 'order-manager.js', needle: '_allocateOrderId' }],
  'order-explicit-place-audit': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1' }, { hint: 'order-manager.js', needle: '_assertExplicitPlaceAudit' }],
  'order-mc-layout-teardown-retains-host-orders': [{ hint: 'multichart-manager.js', needle: 'removeChart' }], // structural; also check OM not cleared — soft
  'order-sel01-exact-teardown': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_SEL01_EXACT_TEARDOWN_V1' }, { hint: 'order-manager.js', needle: '_pendingTpDeleteSelector' }],
  'order-lifecycle-event-ownership': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_LIFECYCLE_EVENT_OWNERSHIP_V1' }, { hint: 'order-manager.js', needle: '_claimOrderLifecycleEvent' }],
  'order-type-one-tick-pending': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_TYPE_ONE_TICK_PENDING_V1' }],
  'order-single-tp-after-trail': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL_V1' }],
  'order-balance-floor': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_BALANCE_FLOOR_V1' }],
  'order-entry-new-draft-reset': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET_V1' }],
  'order-new-draft-constraint-reset': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET_V1' }],
  'order-cancel-before-confirm': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_CANCEL_BEFORE_CONFIRM_V1' }],
  'order-line-edge-visibility': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1' }],
  'order-pending-close-netting': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_PENDING_CLOSE_NETTING_V1' }],
  'order-pair-switch-draft-rebind': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_PAIR_SWITCH_DRAFT_REBIND_V1' }],
  'order-pair-switch-visual-rebind': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1' }],
  'order-split-entry-hover-stick': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_SPLIT_ENTRY_HOVER_STICK_V1' }],
  'order-entry-screenshot-idempotent': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT_V1' }],
  'order-pnl-refresh-stable': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_PNL_RESTORE_STABLE_V1' }],
  'order-exit-marker-spread-column': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1' }],
  'order-risk-qty-on-sl-commit': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_RISK_QTY_ON_SL_COMMIT_V1' }],
  'order-be-place-anchor': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_BE_PLACE_ANCHOR_V1' }],
  'order-preview-live-recalc': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_PREVIEW_LIVE_RECALC_V1' }],
  'order-multi-tp-coincident-stack': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1' }],
  'order-stable-label-hover-dom': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1' }],
  'order-pending-protection-clear': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1' }, { hint: 'order-manager.js', needle: '_emitPendingMirrorSync' }],
  'order-sl-tp-trigger-soak': [{ hint: 'order-manager.js', needle: '_stopLossFillPrice' }], // soak is CI-only; SL product path marker
  'm23-rollback-trade-state': [{ hint: 'order-manager.js', needle: '__TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1' }],
  'm14-fibonacci-settings-levels-persist': [{ hint: 'drawing-tools-manager.js', needle: '__TALARIA_DISABLE_M14_FIB_SETTINGS_LEVELS_PERSIST_V1' }],
  'cross-timeframe-current-price-coherence': [{ hint: 'replay-system.js', needle: '_applyCanonicalReplayMarkFromDetail' }],
  'orderManagerTradeRows': [{ hint: 'orderManagerTradeRows.js', needle: '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1' }, { hint: 'orderManagerTradeRows.js', needle: 'tradeDurationNormV1Enabled' }],
  'v9-theme-tz-honor-chart': [{ hint: 'chart.js', needle: 'timezoneManager' }], // weak — theme tz honor may be bundled differently
  'pins-user-preferences': [{ hint: 'chart.js', needle: 'pins' }], // weak
  'test_session_journal_store': [{ hint: 'session_journal_store.py', needle: 'should_prune_absent_journal_trades' }],
};

function parseLedgerFixed() {
  const text = readFileSync(resolve(root, 'docs/plan3/TICKET-STATUS-LEDGER-20260729.md'), 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 5) continue;
    const [ , ticket, status, commit, gate ] = cells;
    if (!ticket || ticket === 'Ticket' || status !== 'fixed') continue;
    if (/^\d+$/.test(status)) continue;
    const commits = [...String(commit || '').matchAll(/\b([0-9a-f]{7,40})\b/gi)].map((m) => m[1]);
    const gates = [...String(gate || '').matchAll(/([a-z0-9._-]+\.(?:test\.mjs|red\.test\.mjs|py|mjs|js))/gi)].map((m) => m[1]);
    rows.push({ ticket, commitCol: commit, commits, gateCol: gate, gates });
  }
  return rows;
}

function markersForRow(row) {
  const markers = [];
  const seen = new Set();
  const add = (m) => {
    const k = `${m.hint}::${m.needle}`;
    if (seen.has(k)) return;
    seen.add(k);
    markers.push(m);
  };
  for (const g of row.gates) {
    const base = g.replace(/\.red\.test\.mjs$/, '').replace(/\.test\.mjs$/, '').replace(/\.py$/, '');
    for (const [key, list] of Object.entries(GATE_TO_MARKERS)) {
      if (base.includes(key) || g.includes(key)) list.forEach(add);
    }
  }
  // Commit-column heuristics for rows without parseable gate files
  const gc = `${row.gateCol} ${row.commitCol}`.toLowerCase();
  if (/m23|rollback|rayan #1|rayan #3|rayan #6b/.test(gc) || /Rayan #1|Rayan #3|Rayan #6b|M23/.test(row.ticket)) {
    GATE_TO_MARKERS['m23-rollback-trade-state'].forEach(add);
  }
  if (/Rayan #8/.test(row.ticket) || /\bgap \+ place-audit\b|\bplace-audit CONF-01\b/i.test(gc)) {
    GATE_TO_MARKERS['m24-order-id-gap-after-hydrate'].forEach(add);
    GATE_TO_MARKERS['order-explicit-place-audit'].forEach(add);
  }
  if (/four-symbol teardown|mc-layout-teardown|rayan #2/i.test(gc) || /Rayan #2/.test(row.ticket)) {
    add({ hint: 'multichart-manager.js', needle: 'removeChart' });
    add({ hint: 'order-manager.js', needle: 'openPositions' });
  }
  if (/journal prune|session_journal/.test(gc)) GATE_TO_MARKERS['test_session_journal_store'].forEach(add);
  if (/visual rebind/.test(gc) || /TAL-01807b/.test(row.ticket)) GATE_TO_MARKERS['order-pair-switch-visual-rebind'].forEach(add);
  if (/duration gate-01|ordermanagertraderows/i.test(gc) || /TAL-01896/.test(row.ticket)) GATE_TO_MARKERS['orderManagerTradeRows'].forEach(add);
  if (/user-path gate/.test(gc) && /01904/.test(row.ticket)) GATE_TO_MARKERS['order-type-one-tick-pending'].forEach(add);
  if (/sl.?tp.?trigger.?soak|01941/.test(gc + row.ticket)) GATE_TO_MARKERS['order-sl-tp-trigger-soak'].forEach(add);
  if (/draft reset/.test(gc) || /TAL-01897/.test(row.ticket)) GATE_TO_MARKERS['order-entry-new-draft-reset'].forEach(add);
  if (/allocator \+ restore|restore stability/.test(gc) || /Rayan #4|Rayan #5|Rayan #9|Rayan #11/.test(row.ticket)) {
    GATE_TO_MARKERS['m24-order-id-allocator'].forEach(add);
    GATE_TO_MARKERS['m24-order-id-restore-stability'].forEach(add);
  }

  // Do not scrape every __TALARIA_DISABLE_* from listed commits — shared commits
  // (e.g. c0a0d7620) pollute unrelated tickets. Gate→marker map is authoritative.
  return markers;
}

function loadWireBlob(hint) {
  const meta = PATH_HINTS.find((p) => p.hint === hint);
  if (!meta) return { ok: false, reason: 'unknown-hint', text: '' };
  if (hint === 'session_journal_store.py') {
    return { ok: false, reason: 'backend-not-static', text: '', skip: true };
  }
  const accept = (p) => {
    const text = readFileSync(p, 'utf8');
    if (/^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500))) {
      return { ok: false, reason: 'html-trap-not-module', text: '', path: p };
    }
    return { ok: true, text, path: p };
  };
  for (const name of meta.wireNames) {
    const p = join(wireDir, name);
    if (existsSync(p)) return accept(p);
  }
  // try any file in wireDir containing hint basename (handles chart_modules_*.js)
  if (existsSync(wireDir)) {
    const key = basename(hint).replace(/\.(js|mjs|py)$/, '');
    for (const f of readdirSync(wireDir)) {
      if (f.includes(key)) {
        const p = join(wireDir, f);
        return accept(p);
      }
    }
  }
  return { ok: false, reason: 'wire-file-missing', text: '' };
}

async function maybeFetchWire() {
  if (!base) return;
  mkdirSync(wireDir, { recursive: true });
  const fetches = [
    ['/chart/modules/order-manager.js', 'chart_modules_order-manager.js'],
    ['/chart/chart.js', 'chart_chart.js'],
    ['/chart/modules/replay-system.js', 'chart_modules_replay-system.js'],
    ['/chart/talaria-design/src/orderManagerTradeRows.js', 'chart_talaria-design_src_orderManagerTradeRows.js'],
    ['/chart/modules/drawing-tools-manager.js', 'chart_modules_drawing-tools-manager.js'],
    ['/chart/multichart-prod/multichart-manager.js', 'chart_multichart-prod_multichart-manager.js'],
    ['/chart/dist-v9/index.html', 'chart_dist-v9_index.html'],
  ];
  for (const [urlPath, name] of fetches) {
    const dest = join(wireDir, name);
    if (existsSync(dest) && (readFileSync(dest).length > 1000 || name.includes('index'))) continue;
    try {
      const res = await fetch(base.replace(/\/$/, '') + urlPath);
      if (!res.ok) continue;
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    } catch {
      /* keep going */
    }
  }
}

function classifyRow(row, markers) {
  if (!markers.length) {
    return { verdict: 'unverifiable', onWire: null, detail: 'no distinctive markers mapped' };
  }
  const checks = [];
  let anySkip = false;
  let anyMiss = false;
  let anyHit = false;
  for (const m of markers) {
    const blob = loadWireBlob(m.hint);
    if (blob.skip) {
      anySkip = true;
      checks.push({ ...m, present: null, reason: blob.reason });
      continue;
    }
    if (!blob.ok) {
      anyMiss = true;
      checks.push({ ...m, present: false, reason: blob.reason });
      continue;
    }
    const present = blob.text.includes(m.needle);
    checks.push({ ...m, present });
    if (present) anyHit = true;
    else anyMiss = true;
  }
  // backend-only rows: mark backend-unverifiable-static
  if (anySkip && !anyHit && !checks.some((c) => c.present === false && c.reason !== 'backend-not-static')) {
    return { verdict: 'backend-static-unverifiable', onWire: null, checks, detail: 'fix lives in Python/API, not served JS' };
  }
  // soft structural markers only
  if (markers.every((m) => m.needle === 'openPositions' || m.needle === 'removeChart' || m.needle === 'pins' || m.needle === 'checkStopLoss')) {
    return { verdict: anyHit ? 'on-wire-weak' : 'off-wire', onWire: anyHit, checks, detail: 'weak/structural markers only' };
  }
  if (!anyMiss && anyHit) return { verdict: 'on-wire', onWire: true, checks };
  if (anyHit && anyMiss) return { verdict: 'partial', onWire: false, checks, detail: 'some markers present, some absent' };
  return { verdict: 'off-wire', onWire: false, checks };
}

await maybeFetchWire();

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const rows = parseLedgerFixed();
const results = [];
for (const row of rows) {
  const markers = markersForRow(row);
  const cls = classifyRow(row, markers);
  results.push({
    ticket: row.ticket,
    commits: row.commits,
    gates: row.gates,
    markers,
    ...cls,
  });
}

const summary = {
  on_wire: results.filter((r) => r.verdict === 'on-wire').length,
  on_wire_weak: results.filter((r) => r.verdict === 'on-wire-weak').length,
  partial: results.filter((r) => r.verdict === 'partial').length,
  off_wire: results.filter((r) => r.verdict === 'off-wire').length,
  backend_static_unverifiable: results.filter((r) => r.verdict === 'backend-static-unverifiable').length,
  unverifiable: results.filter((r) => r.verdict === 'unverifiable').length,
};

const out = {
  schema: 'talaria.wire-audit-fixed.v1',
  stamp,
  wireDir,
  base,
  tip,
  totalFixed: results.length,
  summary,
  // TEST-01 denominator for "actually on the wire"
  onWireStrict: summary.on_wire,
  onWireIncludingWeak: summary.on_wire + summary.on_wire_weak,
  results,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  schema: out.schema,
  stamp: out.stamp,
  tip: out.tip,
  totalFixed: out.totalFixed,
  summary: out.summary,
  onWireStrict: out.onWireStrict,
  onWireIncludingWeak: out.onWireIncludingWeak,
  outPath,
}, null, 2));
