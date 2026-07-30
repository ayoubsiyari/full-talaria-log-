#!/usr/bin/env node
/**
 * TEST-02 — falsify wire markers against pre-fix bytes (b103 + CKPT corpora).
 *
 * A marker that reads present on pre-fix bytes is vacuous → discarded.
 * Rows left with zero discriminating markers that hit the wire → wire-unproven.
 *
 * Usage:
 *   node scripts/wire-audit-test02-falsify.mjs \
 *     --wire-dir artifacts/wire-b113 \
 *     --stamp 20260730b113 \
 *     --pretest-dir artifacts/wire-pretest
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

const stamp = arg('--stamp', '20260730b113');
const wireDir = arg('--wire-dir', resolve(root, 'artifacts', `wire-${stamp}`));
const pretestDir = arg('--pretest-dir', resolve(root, 'artifacts', 'wire-pretest'));
const auditIn = arg('--audit-in', resolve(root, 'docs/plan3', `WIRE-AUDIT-FIXED-${stamp}.json`));
const outPath = arg('--out', resolve(root, 'docs/plan3', `WIRE-AUDIT-TEST02-${stamp}.json`));
const mdOut = arg('--md', resolve(root, 'docs/plan3', `WIRE-AUDIT-TEST02-${stamp}.md`));

const PATH_HINTS = [
  { hint: 'order-manager.js', wireNames: ['chart_modules_order-manager.js', 'order-manager.js'], pretest: 'order-manager.js' },
  { hint: 'chart.js', wireNames: ['chart_chart.js', 'chart.js'], pretest: 'chart.js' },
  { hint: 'replay-system.js', wireNames: ['chart_modules_replay-system.js', 'replay-system.js'], pretest: 'replay-system.js' },
  { hint: 'orderManagerTradeRows.js', wireNames: ['chart_talaria-design_src_orderManagerTradeRows.js', 'orderManagerTradeRows.js'], pretest: 'orderManagerTradeRows.js' },
  { hint: 'drawing-tools-manager.js', wireNames: ['chart_modules_drawing-tools-manager.js', 'drawing-tools-manager.js'], pretest: 'drawing-tools-manager.js' },
  { hint: 'multichart-manager.js', wireNames: ['chart_multichart-prod_multichart-manager.js', 'multichart-manager.js'], pretest: 'multichart-manager.js' },
  { hint: 'MultichartGrid.jsx', wireNames: ['MultichartGrid.jsx'], pretest: 'MultichartGrid.jsx' },
  { hint: 'session_journal_store.py', wireNames: [], pretest: 'session_journal_store.py', backend: true },
];

const STRUCTURAL = new Set(['openPositions', 'removeChart', 'pins', 'checkStopLoss', 'timezoneManager']);

function loadNamed(dir, names) {
  for (const name of names) {
    const p = join(dir, name);
    if (existsSync(p)) {
      const text = readFileSync(p, 'utf8');
      if (/^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500))) {
        return { ok: false, reason: 'html-trap-not-module', text: '', path: p };
      }
      return { ok: true, text, path: p };
    }
  }
  if (existsSync(dir)) {
    const key = basename(names[0] || '').replace(/\.(js|mjs|jsx|py)$/, '');
    if (key) {
      for (const f of readdirSync(dir)) {
        if (f.includes(key)) {
          const p = join(dir, f);
          const text = readFileSync(p, 'utf8');
          if (/^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500))) {
            return { ok: false, reason: 'html-trap-not-module', text: '', path: p };
          }
          return { ok: true, text, path: p };
        }
      }
    }
  }
  return { ok: false, reason: 'missing', text: '' };
}

function blobForHint(hint, corpus) {
  const meta = PATH_HINTS.find((p) => p.hint === hint);
  if (!meta) return { ok: false, reason: 'unknown-hint', text: '' };
  if (corpus === 'wire') {
    if (meta.backend) return { ok: false, reason: 'backend-not-static', text: '', skip: true };
    return loadNamed(wireDir, meta.wireNames);
  }
  const dir = join(pretestDir, corpus);
  return loadNamed(dir, [meta.pretest, ...meta.wireNames]);
}

function evaluateMarker(hint, needle) {
  const wire = blobForHint(hint, 'wire');
  const b103 = blobForHint(hint, 'b103');
  const ckpt = blobForHint(hint, 'ckpt');

  const wirePresent = wire.ok ? wire.text.includes(needle) : null;
  const b103Present = b103.ok ? b103.text.includes(needle) : null;
  const ckptPresent = ckpt.ok ? ckpt.text.includes(needle) : null;

  let class_ = 'unknown';
  let detail = '';
  if (STRUCTURAL.has(needle)) {
    class_ = 'structural-non-discriminating';
    detail = 'structural needle — never certifies a fix under TEST-02';
  } else if (wire.skip || (!wire.ok && wire.reason === 'backend-not-static')) {
    class_ = 'backend-not-static';
    detail = 'Python/API — needs live API probe';
  } else if (!wire.ok && wirePresent == null) {
    class_ = 'wire-unreachable';
    detail = wire.reason || 'wire blob missing';
  } else if (b103Present === true) {
    class_ = 'vacuous-on-b103';
    detail = 'present on b103 pre-fix corpus — thrown out';
  } else if (b103Present === false && wirePresent === true) {
    class_ = 'discriminating-on-wire';
    detail = 'absent b103, present on live wire';
  } else if (b103Present === false && wirePresent === false) {
    class_ = 'discriminating-off-wire';
    detail = 'absent b103 (would prove fix) but also absent on wire';
  } else if (b103Present == null) {
    class_ = 'baseline-missing';
    detail = `b103 pretest missing for ${hint}`;
  }

  return {
    hint,
    needle,
    wirePresent,
    b103Present,
    ckptPresent,
    class: class_,
    detail,
    wireReason: wire.ok ? null : wire.reason,
  };
}

function classifyRow(ticket, markers, runtime = null) {
  const checks = markers.map((m) => evaluateMarker(m.hint || m.pathHint, m.needle));
  const discOn = checks.filter((c) => c.class === 'discriminating-on-wire');
  const discOff = checks.filter((c) => c.class === 'discriminating-off-wire');
  const vacuous = checks.filter((c) => c.class === 'vacuous-on-b103' || c.class === 'structural-non-discriminating');
  const backend = checks.filter((c) => c.class === 'backend-not-static');
  const unreachable = checks.filter((c) => c.class === 'wire-unreachable');

  if (runtime && runtime.verdict) {
    return {
      ticket,
      verdict: runtime.verdict,
      onWire: runtime.onWire ?? null,
      detail: runtime.detail,
      checks,
      runtime,
      discarded: vacuous.map((c) => c.needle),
    };
  }

  if (!checks.length) {
    return {
      ticket,
      verdict: 'wire-unproven',
      onWire: null,
      detail: 'no markers mapped',
      checks,
      discarded: [],
    };
  }

  if (backend.length && !discOn.length && !discOff.length && checks.every((c) => c.class === 'backend-not-static')) {
    return {
      ticket,
      verdict: 'backend-needs-api-probe',
      onWire: null,
      detail: 'fix lives in Python/API — static wire cannot certify',
      checks,
      discarded: vacuous.map((c) => c.needle),
    };
  }

  if (discOn.length && !discOff.length) {
    return {
      ticket,
      verdict: 'on-wire',
      onWire: true,
      detail: `${discOn.length} discriminating marker(s) on wire; ${vacuous.length} discarded`,
      checks,
      discarded: vacuous.map((c) => c.needle),
    };
  }
  if (discOn.length && discOff.length) {
    return {
      ticket,
      verdict: 'partial',
      onWire: false,
      detail: 'some discriminating markers on wire, some absent',
      checks,
      discarded: vacuous.map((c) => c.needle),
    };
  }
  if (discOff.length && !discOn.length) {
    return {
      ticket,
      verdict: 'off-wire',
      onWire: false,
      detail: 'discriminating markers absent on wire (fix not deployed or not in served bytes)',
      checks,
      discarded: vacuous.map((c) => c.needle),
    };
  }
  if (unreachable.length && !discOn.length) {
    return {
      ticket,
      verdict: 'wire-unproven',
      onWire: null,
      detail: 'marker surface not fetchable on wire (needs better marker or deploy path)',
      checks,
      discarded: vacuous.map((c) => c.needle),
    };
  }
  return {
    ticket,
    verdict: 'wire-unproven',
    onWire: null,
    detail: `only vacuous/structural markers remain (${vacuous.length}); cannot certify under TEST-02`,
    checks,
    discarded: vacuous.map((c) => c.needle),
  };
}

/** Load prior TEST-01 audit rows (markers already resolved). */
function loadAuditRows() {
  if (!existsSync(auditIn)) {
    throw new Error(`missing audit input: ${auditIn}`);
  }
  const audit = JSON.parse(readFileSync(auditIn, 'utf8'));
  return audit.results || [];
}

function loadRuntimeOverlay() {
  const map = {};
  const p = resolve(root, 'docs/plan3', `WIRE-RUNTIME-PROBES-${stamp}.json`);
  if (existsSync(p)) {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    for (const r of j.results || []) map[r.ticket] = r;
  }
  const backendPath = resolve(root, 'docs/plan3', `BACKEND-LIVE-PROBE-TAL-01926-${stamp}.json`);
  if (existsSync(backendPath)) {
    const b = JSON.parse(readFileSync(backendPath, 'utf8'));
    map['M24 / TAL-01926'] = {
      ticket: 'M24 / TAL-01926',
      verdict:
        b.verdict === 'on-wire-api'
          ? 'on-wire'
          : b.verdict === 'off-wire-api'
            ? 'off-wire'
            : 'backend-needs-api-probe',
      onWire: b.verdict === 'on-wire-api' ? true : null,
      detail: b.detail,
      backendProbe: b,
    };
  }
  return map;
}

const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const prior = loadAuditRows();
const runtimeMap = loadRuntimeOverlay();

const results = [];
for (const row of prior) {
  const markers = (row.markers || []).map((m) => ({
    hint: m.hint || m.pathHint,
    needle: m.needle,
  }));
  // Rayan #8: ensure both discriminating product flags are evaluated even if prior map was thin
  if (/Rayan #8/i.test(row.ticket)) {
    const need = [
      ['order-manager.js', '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1'],
      ['order-manager.js', '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1'],
      ['order-manager.js', '_assertExplicitPlaceAudit'],
      ['order-manager.js', '_m24ReconcileOrderIdCounter'], // expected vacuous
    ];
    for (const [hint, needle] of need) {
      if (!markers.some((m) => m.needle === needle)) markers.push({ hint, needle });
    }
  }
  if (/Rayan #2/i.test(row.ticket)) {
    const need = [
      ['multichart-manager.js', 'removeChart'],
      ['order-manager.js', 'openPositions'],
    ];
    for (const [hint, needle] of need) {
      if (!markers.some((m) => m.needle === needle)) markers.push({ hint, needle });
    }
  }
  if (/TAL-01896/i.test(row.ticket)) {
    const need = [
      ['orderManagerTradeRows.js', '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1'],
      ['orderManagerTradeRows.js', 'tradeDurationNormV1Enabled'],
    ];
    for (const [hint, needle] of need) {
      if (!markers.some((m) => m.needle === needle)) markers.push({ hint, needle });
    }
  }
  const rt = runtimeMap[row.ticket] || null;
  results.push(classifyRow(row.ticket, markers, rt));
}

const summary = {
  on_wire: results.filter((r) => r.verdict === 'on-wire').length,
  partial: results.filter((r) => r.verdict === 'partial').length,
  off_wire: results.filter((r) => r.verdict === 'off-wire').length,
  wire_unproven: results.filter((r) => r.verdict === 'wire-unproven').length,
  backend_needs_api_probe: results.filter((r) => r.verdict === 'backend-needs-api-probe').length,
};

const vacuousNeedles = [...new Set(results.flatMap((r) => r.checks.filter((c) => c.class === 'vacuous-on-b103').map((c) => c.needle)))].sort();
const discOnWire = [...new Set(results.flatMap((r) => r.checks.filter((c) => c.class === 'discriminating-on-wire').map((c) => c.needle)))].sort();
const discOffWire = [...new Set(results.flatMap((r) => r.checks.filter((c) => c.class === 'discriminating-off-wire').map((c) => c.needle)))].sort();

const out = {
  schema: 'talaria.wire-audit-test02.v1',
  ruling: 'TEST-02',
  stamp,
  tip,
  wireDir,
  pretestDir,
  priorAudit: auditIn,
  priorOnWireStrict: (JSON.parse(readFileSync(auditIn, 'utf8')).onWireStrict ?? null),
  totalFixed: results.length,
  summary,
  onWireStrictTest02: summary.on_wire,
  vacuousNeedlesThrownOut: vacuousNeedles,
  discriminatingOnWire: discOnWire,
  discriminatingOffWire: discOffWire,
  results,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));

const money = ['Rayan #2', 'Rayan #8', 'TAL-01896', 'TAL-01807b', 'M24 / TAL-01926'];
const moneyLines = money.map((t) => {
  const r = results.find((x) => x.ticket === t);
  return r ? `| ${t} | ${r.verdict} | ${r.detail} |` : `| ${t} | missing | |`;
}).join('\n');

const md = `# WIRE-AUDIT TEST-02 — ${stamp}

**Tip:** \`${tip}\`  
**Schema:** \`talaria.wire-audit-test02.v1\`  
**Pre-fix corpora:** \`artifacts/wire-pretest/b103\` + \`artifacts/wire-pretest/ckpt\`  
**Prior TEST-01 strict on-wire:** ${out.priorOnWireStrict} → **TEST-02 strict on-wire:** **${summary.on_wire}**

## Summary

| Verdict | Count |
|---|---:|
| on-wire | ${summary.on_wire} |
| partial | ${summary.partial} |
| off-wire | ${summary.off_wire} |
| wire-unproven | ${summary.wire_unproven} |
| backend-needs-api-probe | ${summary.backend_needs_api_probe} |

## Money-path rows (priority)

| Ticket | Verdict | Detail |
|---|---|---|
${moneyLines}

## Discriminating markers on wire

${discOnWire.length ? discOnWire.map((n) => `- \`${n}\``).join('\n') : '_none_'}

## Discriminating markers off wire (need next train / B)

${discOffWire.length ? discOffWire.map((n) => `- \`${n}\``).join('\n') : '_none_'}

## Vacuous needles thrown out (present on b103)

${vacuousNeedles.length} needles. See JSON \`vacuousNeedlesThrownOut\`.

## Method

For each marker: present on b103 pretest bytes → **vacuous**, discarded.  
Structural needles (\`removeChart\`, \`openPositions\`, …) never certify.  
Only discriminating markers (absent b103, present wire) can yield \`on-wire\`.
`;

writeFileSync(mdOut, md);
console.log(JSON.stringify({
  schema: out.schema,
  stamp: out.stamp,
  tip: out.tip,
  priorOnWireStrict: out.priorOnWireStrict,
  summary: out.summary,
  onWireStrictTest02: out.onWireStrictTest02,
  vacuousCount: vacuousNeedles.length,
  outPath,
  mdOut,
}, null, 2));
