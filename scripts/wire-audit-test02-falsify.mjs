#!/usr/bin/env node
/**
 * TEST-02 (amended 16:35) — wire markers vs `<fix-commit>^` per needle.
 *
 * A marker is discriminating if absent from the source tree at the parent of
 * the commit that introduced it, and present in deployed wire bytes.
 * Reference is per-row from git history — never a shared deployed build.
 *
 * Usage:
 *   node scripts/wire-audit-test02-falsify.mjs --stamp 20260730b113 --wire-dir artifacts/wire-b113
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
const auditIn = arg('--audit-in', resolve(root, 'docs/plan3', `WIRE-AUDIT-FIXED-${stamp}.json`));
const markersIn = arg('--markers', resolve(root, 'docs/plan3/FIXED-WIRE-MARKERS-20260730.json'));
const outPath = arg('--out', resolve(root, 'docs/plan3', `WIRE-AUDIT-TEST02-${stamp}.json`));
const mdOut = arg('--md', resolve(root, 'docs/plan3', `WIRE-AUDIT-TEST02-${stamp}.md`));
const cachePath = arg('--cache', resolve(root, 'artifacts', 'wire-pretest', 'fix-commit-cache.json'));

const PATH_HINTS = [
  { hint: 'order-manager.js', local: 'chart v 1.4/chart/modules/order-manager.js', wireNames: ['chart_modules_order-manager.js', 'order-manager.js'] },
  { hint: 'chart.js', local: 'chart v 1.4/chart/chart.js', wireNames: ['chart_chart.js', 'chart.js'] },
  { hint: 'replay-system.js', local: 'chart v 1.4/chart/modules/replay-system.js', wireNames: ['chart_modules_replay-system.js', 'replay-system.js'] },
  { hint: 'orderManagerTradeRows.js', local: 'chart v 1.4/talaria-design/src/orderManagerTradeRows.js', wireNames: ['chart_talaria-design_src_orderManagerTradeRows.js', 'orderManagerTradeRows.js'] },
  { hint: 'drawing-tools-manager.js', local: 'chart v 1.4/chart/modules/drawing-tools-manager.js', wireNames: ['chart_modules_drawing-tools-manager.js', 'drawing-tools-manager.js'] },
  { hint: 'multichart-manager.js', local: 'chart v 1.4/chart/multichart-prod/multichart-manager.js', wireNames: ['chart_multichart-prod_multichart-manager.js', 'multichart-manager.js'] },
  { hint: 'v9-theme-bridge.js', local: 'chart v 1.4/chart/modules/v9-theme-bridge.js', wireNames: ['chart_modules_v9-theme-bridge.js', 'v9-theme-bridge.js'] },
  { hint: 'favorites-manager.js', local: 'chart v 1.4/chart/modules/favorites-manager.js', wireNames: ['chart_modules_favorites-manager.js', 'favorites-manager.js'] },
  { hint: 'preferences-sync.js', local: 'chart v 1.4/chart/modules/preferences-sync.js', wireNames: ['chart_modules_preferences-sync.js', 'preferences-sync.js'] },
  { hint: 'session_journal_store.py', local: 'chart v 1.4/chart/session_journal_store.py', wireNames: [], backend: true },
];

const STRUCTURAL = new Set(['openPositions', 'removeChart', 'pins', 'checkStopLoss', 'timezoneManager']);
const TIP_NOISE = new Set(['147fa8e5f', '147fa8e5f45a639b1fa2719557791904b2b4bb8a', 'f2d60a461', '9c3c13834']);

const gitCache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { fixCommits: {}, parentBlobs: {}, pathHist: {} };

function git(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function qPath(p) {
  // git pathspec quoting for paths with spaces
  return `"${String(p).replace(/"/g, '\\"')}"`;
}

function showAt(commit, localPathStr) {
  return git(`git show ${commit}:${qPath(localPathStr)}`);
}

function localPath(hint) {
  return PATH_HINTS.find((p) => p.hint === hint)?.local || null;
}

function loadWire(hint) {
  const meta = PATH_HINTS.find((p) => p.hint === hint);
  if (!meta) return { ok: false, reason: 'unknown-hint', text: '' };
  if (meta.backend) return { ok: false, reason: 'backend-not-static', text: '', skip: true };
  const tryFile = (p) => {
    const text = readFileSync(p, 'utf8');
    if (/^\s*<!DOCTYPE html/i.test(text) || /<html[\s>]/i.test(text.slice(0, 500))) {
      return { ok: false, reason: 'html-trap-not-module', text: '', path: p };
    }
    return { ok: true, text, path: p };
  };
  for (const name of meta.wireNames) {
    const p = join(wireDir, name);
    if (existsSync(p)) return tryFile(p);
  }
  if (existsSync(wireDir)) {
    const key = basename(hint).replace(/\.(js|mjs|py)$/, '');
    for (const f of readdirSync(wireDir)) {
      if (f.includes(key)) return tryFile(join(wireDir, f));
    }
  }
  return { ok: false, reason: 'wire-file-missing', text: '' };
}

function resolveFixCommit(hint, needle, candidates = []) {
  const key = `${hint}::${needle}`;
  if (gitCache.fixCommits[key]) return gitCache.fixCommits[key];

  const local = localPath(hint);
  for (const c of candidates) {
    const short = String(c).slice(0, 9);
    if (!c || TIP_NOISE.has(c) || TIP_NOISE.has(short)) continue;
    if (!local) continue;
    const atFix = showAt(c, local);
    if (!atFix.includes(needle)) continue;
    // Use ~1 not ^ — on Windows cmd, bare ^ is eaten and resolves to the tip itself.
    const atParent = showAt(`${c}~1`, local);
    if (!atParent.includes(needle)) {
      const full = git(`git rev-parse ${c}`);
      gitCache.fixCommits[key] = full || c;
      return gitCache.fixCommits[key];
    }
  }

  if (local) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = git(`git log --reverse -G ${JSON.stringify(escaped)} --format=%H -1 -- ${qPath(local)}`);
    if (found) {
      // Verify ~1 truly lacks the needle ( -G can land on a later edit).
      if (!showAt(`${found}~1`, local).includes(needle) && showAt(found, local).includes(needle)) {
        gitCache.fixCommits[key] = found;
        return found;
      }
    }
    const bisect = findIntroducingByBisect(local, needle);
    if (bisect) {
      gitCache.fixCommits[key] = bisect;
      return bisect;
    }
  }

  gitCache.fixCommits[key] = null;
  return null;
}

/** Monotonic binary search over path history for first commit containing needle. */
function findIntroducingByBisect(local, needle) {
  let hist = gitCache.pathHist[local];
  if (!Array.isArray(hist)) {
    hist = git(`git log --format=%H -- ${qPath(local)}`).split(/\r?\n/).filter(Boolean);
    gitCache.pathHist[local] = hist;
  }
  if (!hist.length) return null;
  // hist[0]=newest … hist[n-1]=oldest. Search oldest→newest for first presence.
  const rev = [...hist].reverse();
  let lo = 0;
  let hi = rev.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const blob = showAt(rev[mid], local);
    if (blob.includes(needle)) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (ans < 0) return null;
  const intro = rev[ans];
  if (ans === 0) {
    // Oldest revision already has it — no parent in this path history.
    return null;
  }
  const parent = rev[ans - 1];
  if (showAt(parent, local).includes(needle)) return null;
  return intro;
}

function parentHasNeedle(fixCommit, hint, needle) {
  const local = localPath(hint);
  if (!fixCommit || !local) return null;
  const key = `${fixCommit}~1::${local}`;
  let text = gitCache.parentBlobs[key];
  if (text == null) {
    text = showAt(`${fixCommit}~1`, local);
    // Cache presence only for large blobs (avoid multi-MB JSON cache).
    if (text.length > 400_000) {
      const hit = text.includes(needle);
      gitCache.parentBlobs[`${key}::${needle}`] = hit ? '__HAS__' : '__MISS__';
      return hit;
    }
    gitCache.parentBlobs[key] = text || '';
  }
  const perNeedle = gitCache.parentBlobs[`${key}::${needle}`];
  if (perNeedle === '__HAS__') return true;
  if (perNeedle === '__MISS__') return false;
  if (text === '__HAS__') return true;
  if (text === '__MISS__') return false;
  return text.includes(needle);
}

function tipHasNeedle(hint, needle) {
  const local = localPath(hint);
  if (!local || !existsSync(resolve(root, local))) return null;
  return readFileSync(resolve(root, local), 'utf8').includes(needle);
}

function evaluateMarker(hint, needle, candidates = []) {
  const wire = loadWire(hint);
  const wirePresent = wire.ok ? wire.text.includes(needle) : null;

  if (STRUCTURAL.has(needle)) {
    return {
      hint, needle, wirePresent,
      fixCommit: null, parentPresent: null,
      class: 'structural-non-discriminating',
      detail: 'structural needle — behavioural probe required for money rows',
    };
  }
  if (wire.skip || wire.reason === 'backend-not-static') {
    return {
      hint, needle, wirePresent: null,
      fixCommit: null, parentPresent: null,
      class: 'backend-not-static',
      detail: 'Python/API — needs live API probe',
    };
  }

  const fixCommit = resolveFixCommit(hint, needle, candidates);
  if (!fixCommit) {
    // Fallback: tip has needle and wire has it — unproven discrimination without parent
    if (wirePresent && tipHasNeedle(hint, needle)) {
      return {
        hint, needle, wirePresent, fixCommit: null, parentPresent: null,
        class: 'fix-commit-unresolved',
        detail: 'could not locate introducing commit; cannot apply parent^ rule',
      };
    }
    if (wirePresent === false) {
      return {
        hint, needle, wirePresent, fixCommit: null, parentPresent: null,
        class: 'off-wire-unresolved-fix',
        detail: 'absent on wire; introducing commit unresolved',
      };
    }
    return {
      hint, needle, wirePresent, fixCommit: null, parentPresent: null,
      class: 'fix-commit-unresolved',
      detail: 'introducing commit not found in git history',
    };
  }

  const parentPresent = parentHasNeedle(fixCommit, hint, needle);
  const short = git(`git rev-parse --short ${fixCommit}`) || fixCommit.slice(0, 9);

  if (!wire.ok) {
    return {
      hint, needle, wirePresent: false, fixCommit: short, parentPresent,
      class: 'wire-unreachable',
      detail: wire.reason || 'wire blob missing',
    };
  }

  if (parentPresent === true) {
    return {
      hint, needle, wirePresent, fixCommit: short, parentPresent,
      class: 'vacuous-at-parent',
      detail: `present at ${short}~1 — not the introducing delta`,
    };
  }

  if (parentPresent === false && wirePresent === true) {
    return {
      hint, needle, wirePresent, fixCommit: short, parentPresent,
      class: 'discriminating-on-wire',
      detail: `absent at ${short}~1, present on wire`,
    };
  }
  if (parentPresent === false && wirePresent === false) {
    return {
      hint, needle, wirePresent, fixCommit: short, parentPresent,
      class: 'discriminating-off-wire',
      detail: `absent at ${short}~1 and absent on wire — fix not deployed`,
    };
  }

  return {
    hint, needle, wirePresent, fixCommit: short, parentPresent,
    class: 'unknown',
    detail: 'unclassified',
  };
}

function classifyRow(ticket, markers, runtime = null) {
  const checks = markers.map((m) =>
    evaluateMarker(m.hint || m.pathHint, m.needle, m.candidates || []));

  if (runtime && runtime.verdict) {
    return {
      ticket,
      verdict: runtime.verdict,
      onWire: runtime.onWire ?? null,
      detail: runtime.detail,
      method: runtime.kind || 'runtime',
      checks,
      runtime,
      discarded: checks.filter((c) => c.class === 'vacuous-at-parent' || c.class === 'structural-non-discriminating').map((c) => c.needle),
    };
  }

  const discOn = checks.filter((c) => c.class === 'discriminating-on-wire');
  const discOff = checks.filter((c) => c.class === 'discriminating-off-wire');
  const vacuous = checks.filter((c) => c.class === 'vacuous-at-parent' || c.class === 'structural-non-discriminating');
  const backend = checks.filter((c) => c.class === 'backend-not-static');
  const unresolved = checks.filter((c) => c.class === 'fix-commit-unresolved' || c.class === 'off-wire-unresolved-fix');
  const unreachable = checks.filter((c) => c.class === 'wire-unreachable');

  if (!checks.length) {
    return { ticket, verdict: 'wire-unproven', onWire: null, detail: 'no markers mapped', checks, discarded: [] };
  }
  if (backend.length && checks.every((c) => c.class === 'backend-not-static')) {
    return {
      ticket, verdict: 'backend-needs-api-probe', onWire: null,
      detail: 'fix lives in Python/API — static wire cannot certify',
      checks, discarded: vacuous.map((c) => c.needle),
    };
  }
  if (discOn.length && !discOff.length) {
    return {
      ticket, verdict: 'on-wire', onWire: true,
      detail: `${discOn.length} discriminating marker(s) vs fix-commit^; on wire`,
      checks, discarded: vacuous.map((c) => c.needle),
    };
  }
  if (discOn.length && discOff.length) {
    return {
      ticket, verdict: 'partial', onWire: false,
      detail: 'some discriminating markers on wire, some absent',
      checks, discarded: vacuous.map((c) => c.needle),
    };
  }
  if (discOff.length && !discOn.length) {
    return {
      ticket, verdict: 'off-wire', onWire: false,
      detail: 'discriminating markers absent on wire (fix not in deployed bytes)',
      checks, discarded: vacuous.map((c) => c.needle),
    };
  }
  if (unreachable.length && !discOn.length) {
    return {
      ticket, verdict: 'delivery-unserved', onWire: null,
      detail: 'marker surface not served / not fetchable on canary (delivery question)',
      checks, discarded: vacuous.map((c) => c.needle),
    };
  }
  if (unresolved.length && wirePresentAny(checks)) {
    return {
      ticket, verdict: 'wire-unproven', onWire: null,
      detail: 'present on wire but introducing commit unresolved — cannot apply parent^',
      checks, discarded: vacuous.map((c) => c.needle),
    };
  }
  return {
    ticket, verdict: 'wire-unproven', onWire: null,
    detail: 'no discriminating parent^ proof',
    checks, discarded: vacuous.map((c) => c.needle),
  };
}

function wirePresentAny(checks) {
  return checks.some((c) => c.wirePresent === true);
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
      kind: 'backend-live-api',
      verdict:
        b.verdict === 'on-wire-api' ? 'on-wire'
          : b.verdict === 'off-wire-api' ? 'off-wire'
            : 'backend-needs-api-probe',
      onWire: b.verdict === 'on-wire-api' ? true : null,
      detail: b.detail,
      backendProbe: b,
    };
  }
  return map;
}

function buildMarkerList(ticket, auditRow, markerRow) {
  const out = [];
  const seen = new Set();
  const add = (hint, needle, candidates) => {
    const k = `${hint}::${needle}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ hint, needle, candidates });
  };

  const rowCommits = [
    ...(auditRow?.commits || []),
    ...(markerRow?.commits || []),
  ];
  for (const m of markerRow?.markers || []) {
    add(m.pathHint || m.hint, m.needle, [...rowCommits, m.fromCommit].filter(Boolean));
  }
  for (const m of auditRow?.markers || []) {
    add(m.hint || m.pathHint, m.needle, [...rowCommits, m.fromCommit].filter(Boolean));
  }

  if (/Rayan #8/i.test(ticket)) {
    for (const n of [
      '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1',
      '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1',
      '_assertExplicitPlaceAudit',
      '_m24ReconcileOrderIdCounter',
    ]) add('order-manager.js', n, [...rowCommits, '2baa2c5b1']);
  }
  if (/Rayan #2/i.test(ticket)) {
    add('multichart-manager.js', 'removeChart', [...rowCommits, '2baa2c5b1']);
    add('order-manager.js', 'openPositions', [...rowCommits, '2baa2c5b1']);
  }
  if (/TAL-01896/i.test(ticket)) {
    add('orderManagerTradeRows.js', '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1', [...rowCommits, 'cf32a86d3']);
    add('orderManagerTradeRows.js', 'tradeDurationNormV1Enabled', [...rowCommits, 'cf32a86d3']);
  }
  if (/01807b/i.test(ticket)) {
    add('order-manager.js', '__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1', [...rowCommits, '2baa2c5b1', '2cc949399', 'd5b790e56']);
  }
  // M23 introducing commit is f127d25dd (parent lacks the kill-switch). Do not
  // seed merge/train SHAs (a07e35120 / tip noise) — those are vacuous-at-parent.
  if (/M23|Rayan #1|Rayan #3|Rayan #6b|01937/i.test(ticket)) {
    add('order-manager.js', '__TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1', [
      ...rowCommits, 'f127d25dd', '79711ec2b', '4327f8f5f',
    ]);
  }
  if (/Timezone EST-to-CST/i.test(ticket)) {
    add('v9-theme-bridge.js', '__TALARIA_DISABLE_V9_THEME_TZ_HONOR_CHART_V1', [...rowCommits, 'ed2a183f3']);
  }
  if (/TAL-01895|TAL-01792/i.test(ticket)) {
    add('favorites-manager.js', '__TALARIA_DISABLE_PINS_USER_PREFS_V1', [...rowCommits, '6ad9f48ec']);
    add('preferences-sync.js', '__TALARIA_DISABLE_PINS_USER_PREFS_V1', [...rowCommits, '6ad9f48ec']);
  }
  return out;
}

const tip = git('git rev-parse --short HEAD') || 'unknown';
const prior = JSON.parse(readFileSync(auditIn, 'utf8'));
const markerMap = existsSync(markersIn) ? JSON.parse(readFileSync(markersIn, 'utf8')) : { rows: [] };
const markerByTicket = Object.fromEntries((markerMap.rows || []).map((r) => [r.ticket, r]));
const runtimeMap = loadRuntimeOverlay();

console.error('[test02] evaluating markers vs fix-commit^ …');
const results = [];
for (const row of prior.results || []) {
  const markers = buildMarkerList(row.ticket, row, markerByTicket[row.ticket]);
  const rt = runtimeMap[row.ticket] || null;
  process.stderr.write(`  ${row.ticket} (${markers.length} markers)\n`);
  results.push(classifyRow(row.ticket, markers, rt));
}

mkdirSync(dirname(cachePath), { recursive: true });
writeFileSync(cachePath, JSON.stringify(gitCache, null, 2));

const summary = {
  on_wire: results.filter((r) => r.verdict === 'on-wire').length,
  partial: results.filter((r) => r.verdict === 'partial').length,
  off_wire: results.filter((r) => r.verdict === 'off-wire').length,
  wire_unproven: results.filter((r) => r.verdict === 'wire-unproven').length,
  delivery_unserved: results.filter((r) => r.verdict === 'delivery-unserved').length,
  backend_needs_api_probe: results.filter((r) => r.verdict === 'backend-needs-api-probe').length,
};

const discOnWire = [...new Set(results.flatMap((r) => r.checks.filter((c) => c.class === 'discriminating-on-wire').map((c) => c.needle)))].sort();
const discOffWire = [...new Set(results.flatMap((r) => r.checks.filter((c) => c.class === 'discriminating-off-wire').map((c) => c.needle)))].sort();

const out = {
  schema: 'talaria.wire-audit-test02.v2',
  ruling: 'TEST-02-amended-1635',
  reference: 'fix-commit^ per marker (git history)',
  correction: 'CORRECTION-B103-IS-NOT-A-PRE-FIX-CORPUS-THE-REFERENCE-IS-THE-PARENT-COMMIT-20260730-1635.md',
  stamp,
  tip,
  wireDir,
  priorAudit: auditIn,
  priorOnWireStrictTest01: prior.onWireStrict ?? null,
  priorOnWireStrictTest02_b103mistake: 10,
  totalFixed: results.length,
  summary,
  onWireStrictTest02: summary.on_wire,
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

const md = `# WIRE-AUDIT TEST-02 (amended) — ${stamp}

**Tip:** \`${tip}\`  
**Schema:** \`talaria.wire-audit-test02.v2\`  
**Reference:** \`<fix-commit>^\` per marker (git history) — **not** b103  
**Correction:** \`CORRECTION-B103-IS-NOT-A-PRE-FIX-CORPUS-…-1635.md\`  
**Prior mistaken TEST-02 (b103 corpus):** 10/50 → **corrected:** **${summary.on_wire}/50** discriminating on-wire

## Summary

| Verdict | Count |
|---|---:|
| on-wire | ${summary.on_wire} |
| partial | ${summary.partial} |
| off-wire | ${summary.off_wire} |
| wire-unproven | ${summary.wire_unproven} |
| delivery-unserved | ${summary.delivery_unserved} |
| backend-needs-api-probe | ${summary.backend_needs_api_probe} |

## Money-path rows

| Ticket | Verdict | Detail |
|---|---|---|
${moneyLines}

## Discriminating on wire

${discOnWire.length ? discOnWire.map((n) => `- \`${n}\``).join('\n') : '_none_'}

## Discriminating off wire

${discOffWire.length ? discOffWire.map((n) => `- \`${n}\``).join('\n') : '_none_'}

## Method

For each marker needle: locate introducing commit via ledger/marker candidates or
\`git log -G\`; require **absent at \`commit^\`** and **present on deployed wire**.
Money rows prefer runtime/behavioural probes (overlay) when present.
`;

writeFileSync(mdOut, md);
console.log(JSON.stringify({
  schema: out.schema,
  stamp,
  tip,
  summary: out.summary,
  onWireStrictTest02: out.onWireStrictTest02,
  priorMistake: 10,
  outPath,
  mdOut,
}, null, 2));
