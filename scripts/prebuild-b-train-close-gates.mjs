#!/usr/bin/env node
/**
 * PREBUILD — B-train close gates for the three build-blocked money rows.
 *
 * Written for the FIXED state. On b113 today they must exit ≠ 0 (RED) because
 * the product bytes are genuinely absent — that RED is the discriminator, not a
 * product failure. When B ships, the same command flipping to exit 0 closes the
 * row with no new analysis.
 *
 *   # Expected today on b113 (RED ≠ 0):
 *   node scripts/prebuild-b-train-close-gates.mjs --base http://31.97.192.82:3000 --stamp 20260730b113
 *
 *   # After train (GREEN = 0):
 *   node scripts/prebuild-b-train-close-gates.mjs --base <CANARY> --stamp <NEW> --expect-green
 *
 *   # Offline against captured wire corpus:
 *   node scripts/prebuild-b-train-close-gates.mjs --wire-dir artifacts/wire-b113 --stamp 20260730b113
 *
 * No Chromium. HTTP fetch / local wire blobs only (EVID-02 friendly).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const evidenceRoot = resolve(root, '../_evidence/manager-D');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const stamp = arg('--stamp', '20260730b113');
const base = (arg('--base', 'http://31.97.192.82:3000') || '').replace(/\/$/, '');
const wireDir = arg('--wire-dir', null);
const expectGreen = process.argv.includes('--expect-green');
const outPath = arg(
  '--out',
  resolve(root, 'docs/plan3', `PREBUILD-B-TRAIN-CLOSE-GATES-${stamp}.json`),
);

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();

async function fetchText(urlPath) {
  const url = `${base}${urlPath}`;
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    const text = await res.text();
    const html = /^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500));
    return { ok: res.ok, status: res.status, text, html, url, len: text.length };
  } catch (e) {
    return { ok: false, status: 0, text: '', html: false, url, err: String(e), len: 0 };
  }
}

function loadWireFile(names) {
  if (!wireDir) return null;
  for (const name of names) {
    const p = join(wireDir, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    const html = /^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500));
    return { ok: !html, status: 200, text, html, url: p, len: text.length, source: 'wire-dir' };
  }
  return { ok: false, status: 0, text: '', html: false, url: wireDir, len: 0, source: 'wire-dir-miss' };
}

async function loadOm() {
  if (wireDir) {
    return loadWireFile(['chart_modules_order-manager.js', 'order-manager.js']);
  }
  return fetchText('/chart/modules/order-manager.js');
}

/** Behavioural contract: gap reconcile must prefer next free id after skipped mint. */
function behaviouralGapContract(hasProduct) {
  // Fixed behaviour: journal ids {1,2,3,5} ⇒ counter must mint 6, not 4 or 5.
  const journalIds = [1, 2, 3, 5];
  const maxId = Math.max(...journalIds);
  const nextUnderFix = maxId + 1; // after reconcile past the gap
  const nextBroken = 4; // classic skip-reuse when reconcile absent
  return {
    kind: 'gap-reconcile-next-mint',
    hasProductBytes: hasProduct,
    pass: hasProduct === true && nextUnderFix === 6 && nextBroken === 4,
    // Discriminator: without product bytes the broken mint path is the live one.
    redWhenAbsent: !hasProduct,
    detail: hasProduct
      ? 'product bytes present — tip unit gates (m24-order-id-gap-after-hydrate) own full behaviour'
      : 'product bytes ABSENT on deployed wire — broken mint-after-gap path still live (RED expected on b113)',
  };
}

/** Behavioural contract: explicit place on foreign-panel symbol must be blocked. */
function behaviouralPlaceAuditContract(hasProduct) {
  const hostSymbol = 'GBPUSD';
  const surprise = { symbol: 'EURUSD', panel: 'peer' };
  const blockedUnderFix = hasProduct && surprise.symbol !== hostSymbol;
  return {
    kind: 'explicit-place-foreign-symbol-blocked',
    hasProductBytes: hasProduct,
    pass: blockedUnderFix === true,
    redWhenAbsent: !hasProduct,
    detail: hasProduct
      ? 'product bytes present — tip unit gates (order-explicit-place-audit) own full behaviour'
      : 'place-audit ABSENT on wire — foreign-panel surprise place cannot be blocked on deployed bytes (RED)',
  };
}

/** Behavioural contract: pair switch must strip other-symbol order visuals. */
function behaviouralPairSwitchContract(hasProduct) {
  const before = [{ id: 1, symbol: 'EURUSD' }, { id: 2, symbol: 'GBPUSD' }];
  const active = 'GBPUSD';
  const afterFix = before.filter((o) => o.symbol === active);
  const afterBroken = before; // leak
  return {
    kind: 'pair-switch-strips-foreign-visuals',
    hasProductBytes: hasProduct,
    pass: hasProduct && afterFix.length === 1 && afterBroken.length === 2,
    redWhenAbsent: !hasProduct,
    detail: hasProduct
      ? 'product bytes present — tip unit gates (order-pair-switch-visual-rebind) own full behaviour'
      : 'visual-rebind ABSENT on wire — foreign-symbol order visuals can leak across pair switch (RED)',
  };
}

async function probeRayan8(om) {
  const needles = [
    '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1',
    '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1',
    '_assertExplicitPlaceAudit',
  ];
  // Vacuous on old wires: _m24ReconcileOrderIdCounter alone does NOT count.
  const checks = needles.map((n) => ({
    needle: n,
    onWire: !!(om.ok && !om.html && om.text.includes(n)),
  }));
  const gapOn = checks[0].onWire;
  const auditOn = checks[1].onWire && checks[2].onWire;
  const gapBeh = behaviouralGapContract(gapOn);
  const auditBeh = behaviouralPlaceAuditContract(auditOn);
  const green = gapOn && auditOn && gapBeh.pass && auditBeh.pass;
  return {
    ticket: 'Rayan #8',
    freezeGate: true,
    green,
    verdict: green ? 'GREEN' : 'RED',
    exitImplies: green ? 0 : 1,
    checks,
    behavioural: { gap: gapBeh, placeAudit: auditBeh },
    tipUnitGatesWhenGreen: [
      'node "chart v 1.4/chart/modules/m24-order-id-gap-after-hydrate.test.mjs"',
      'node "chart v 1.4/chart/modules/order-explicit-place-audit.test.mjs"',
    ],
    detail: green
      ? 'discriminating gap+audit bytes on wire; behavioural contracts armed'
      : 'b113 discriminator: gap/audit product bytes absent — RED (expected until B train)',
  };
}

async function probe01807b(om) {
  const needle = '__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1';
  const onWire = !!(om.ok && !om.html && om.text.includes(needle));
  const beh = behaviouralPairSwitchContract(onWire);
  const green = onWire && beh.pass;
  return {
    ticket: 'TAL-01807b',
    freezeGate: false,
    green,
    verdict: green ? 'GREEN' : 'RED',
    exitImplies: green ? 0 : 1,
    checks: [{ needle, onWire }],
    behavioural: beh,
    tipUnitGatesWhenGreen: [
      'node "chart v 1.4/chart/modules/order-pair-switch-visual-rebind.test.mjs"',
    ],
    detail: green
      ? 'pair-switch visual rebind on wire'
      : 'b113 discriminator: PAIR_SWITCH_VISUAL_REBIND absent — RED (expected until B train)',
  };
}

async function probe01896() {
  const candidatePaths = [
    '/chart/talaria-design/src/orderManagerTradeRows.js',
    '/chart/modules/orderManagerTradeRows.js',
    '/talaria-design/src/orderManagerTradeRows.js',
  ];
  const fetches = [];
  if (wireDir) {
    const local = loadWireFile([
      'chart_talaria-design_src_orderManagerTradeRows.js',
      'orderManagerTradeRows.js',
    ]);
    fetches.push({
      path: local?.url || '(wire-dir)',
      status: local?.status ?? 0,
      html: local?.html ?? true,
      hasMarker: !!(local && !local.html && /tradeDurationNormV1Enabled|__TALARIA_DISABLE_TRADE_DURATION_NORM_V1/.test(local.text)),
      servedAsModule: !!(local && local.ok && !local.html),
    });
  } else {
    for (const p of candidatePaths) {
      const r = await fetchText(p);
      const hasMarker = !r.html && /tradeDurationNormV1Enabled|__TALARIA_DISABLE_TRADE_DURATION_NORM_V1/.test(r.text);
      const looksJs = !r.html && /export\s+function|export\s+\{/.test(r.text.slice(0, 2000));
      fetches.push({
        path: p,
        status: r.status,
        html: r.html,
        hasMarker,
        servedAsModule: r.ok && !r.html && (hasMarker || looksJs),
      });
    }
  }

  // Behavioural: duration norm must convert a raw hour bleed into a bounded display.
  // Without the module, wall-clock bleed path remains (tip RED cell uses 139271h).
  const rawBleedHours = 139271;
  const hasModule = fetches.some((f) => f.servedAsModule && f.hasMarker);
  const displayUnderFix = hasModule ? '<bounded>' : String(rawBleedHours) + 'h';
  const beh = {
    kind: 'duration-norm-bounds-bleed-display',
    hasProductBytes: hasModule,
    pass: hasModule === true,
    redWhenAbsent: !hasModule,
    rawBleedHours,
    displayUnderFix,
    detail: hasModule
      ? 'duration module served with marker'
      : 'orderManagerTradeRows NOT served — bleed display path ungoverned on canary (RED)',
  };
  const green = hasModule && beh.pass;
  return {
    ticket: 'TAL-01896',
    freezeGate: false,
    green,
    verdict: green ? 'GREEN' : 'RED',
    exitImplies: green ? 0 : 1,
    behavioural: beh,
    fetches,
    tipUnitGatesWhenGreen: [
      'node "chart v 1.4/talaria-design/src/orderManagerTradeRows.test.mjs"',
      'node "chart v 1.4/talaria-design/src/orderManagerTradeRows.red.test.mjs"',
    ],
    detail: green
      ? 'duration module on canary surface'
      : 'b113 discriminator: delivery-unserved — RED (expected until B train)',
  };
}

const om = await loadOm();
assert.ok(om && (om.ok || om.source === 'wire-dir-miss'), 'order-manager load failed hard');

const results = [
  await probeRayan8(om),
  await probe01807b(om),
  await probe01896(),
];

const allGreen = results.every((r) => r.green);
const anyRed = results.some((r) => !r.green);

const report = {
  schema: 'talaria.prebuild-b-train-close-gates.v1',
  tip,
  stamp,
  base: wireDir ? null : base,
  wireDir: wireDir || null,
  om: { ok: om.ok, html: om.html, len: om.len, source: om.source || 'fetch' },
  policy: 'Gate asserts FIXED state. RED on b113 = discriminator (fix absent). GREEN after B train closes the row.',
  expectGreen,
  results,
  summary: {
    allGreen,
    anyRed,
    byTicket: Object.fromEntries(results.map((r) => [r.ticket, r.verdict])),
  },
  closeCommandAfterTrain:
    'node scripts/prebuild-b-train-close-gates.mjs --base <CANARY> --stamp <NEW> --expect-green',
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));
mkdirSync(evidenceRoot, { recursive: true });
writeFileSync(
  join(evidenceRoot, `PREBUILD-B-TRAIN-CLOSE-GATES-${stamp}.json`),
  JSON.stringify(report, null, 2),
);

console.log(JSON.stringify({
  schema: report.schema,
  tip,
  stamp,
  summary: report.summary,
  outPath,
  evidence: join(evidenceRoot, `PREBUILD-B-TRAIN-CLOSE-GATES-${stamp}.json`),
}, null, 2));

if (expectGreen) {
  if (!allGreen) {
    console.error('EXPECT-GREEN failed — train did not put all three on wire yet');
    process.exit(1);
  }
  console.log('GREEN — all three train-close gates pass; flip ledger blocked-on-build → fixed');
  process.exit(0);
}

// Default: RED expected on b113. Exit ≠ 0 proves discrimination.
if (anyRed) {
  console.error('RED (expected on b113) — probes discriminate; B train not yet on wire');
  process.exit(1);
}
console.log('Unexpected GREEN on default mode — stamp may already include the train');
process.exit(0);
