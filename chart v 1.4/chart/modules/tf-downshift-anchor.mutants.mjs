/**
 * TF-DOWNSHIFT-ANCHOR — on-disk mutation runner (both chart.js mirrors).
 *
 *   cd "chart v 1.4/chart/modules"
 *   node tf-downshift-anchor.mutants.mjs
 *
 * Each mutant needle must occur EXACTLY ONCE per file. Mutate BOTH mirrors
 * (mirror-byte-identity cell would otherwise inflate every kill). Restore +
 * SHA-verify after each mutant. TAP suite parsed for real cell failures.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const CANON = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const TEST = path.join(__dirname, 'tf-downshift-anchor.test.mjs');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const CANON_BYTES = fs.readFileSync(CANON);
const MIRROR_BYTES = fs.readFileSync(MIRROR);
const CANON_SHA = sha(CANON_BYTES);
const MIRROR_SHA = sha(MIRROR_BYTES);
if (CANON_SHA !== MIRROR_SHA) {
  console.error('FATAL: mirrors not byte-identical before mutation run');
  process.exit(2);
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while (true) {
    const j = hay.indexOf(needle, i);
    if (j === -1) return n;
    n += 1;
    i = j + needle.length;
  }
}

function applyOnce(source, needle, replacement, label) {
  const n = countOccurrences(source, needle);
  if (n !== 1) {
    return { ok: false, source, reason: `NOT_APPLIED ${label}: needle count=${n} (need 1)` };
  }
  return { ok: true, source: source.replace(needle, replacement), reason: null };
}

function restoreAll() {
  fs.writeFileSync(CANON, CANON_BYTES);
  fs.writeFileSync(MIRROR, MIRROR_BYTES);
  const a = sha(fs.readFileSync(CANON));
  const b = sha(fs.readFileSync(MIRROR));
  if (a !== CANON_SHA || b !== MIRROR_SHA) {
    console.error('FATAL: restore SHA mismatch');
    process.exit(2);
  }
}

function runSuite() {
  const r = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', TEST],
    { encoding: 'utf8', cwd: __dirname },
  );
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const failed = [];
  for (const line of out.split('\n')) {
    // TAP: "not ok N - title"
    const m = /^not ok \d+ - (.+)$/.exec(line);
    if (m) failed.push(m[1].trim());
  }
  return { code: r.status, failed, out };
}

const mutants = [
  {
    id: 'M1',
    name: 'force fix OFF at init (always legacy bar-start)',
    needle: 'let tfDownshiftAnchorFixOn = true;',
    replacement: 'let tfDownshiftAnchorFixOn = false;',
    behavioural: true,
  },
  {
    id: 'M2',
    name: 'invert kill-switch polarity (flag enables fix instead of disabling)',
    needle: `            if (typeof window !== 'undefined'
                && window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1) {
                tfDownshiftAnchorFixOn = false;
            }`,
    replacement: `            if (typeof window !== 'undefined'
                && window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1) {
                tfDownshiftAnchorFixOn = true;
            }`,
    // Also need default false — applied as second replace via needle2
    needle2: 'let tfDownshiftAnchorFixOn = true;',
    replacement2: 'let tfDownshiftAnchorFixOn = false;',
    behavioural: true,
  },
  {
    id: 'M3',
    name: 'period-end branch returns bar.t (legacy start)',
    needle: '        if (Number.isFinite(endMs) && endMs > bar.t) return endMs - 1;',
    replacement: '        if (Number.isFinite(endMs) && endMs > bar.t) return bar.t;',
    behavioural: true,
  },
  {
    id: 'M4',
    name: 'live follow-latest site uses rightBar.t (skips helper)',
    needle: '                anchorTs = this._resolveTfSwitchRightEdgeAnchorTs(rightBar, rightBarIdx);',
    replacement: '                anchorTs = rightBar.t;',
    behavioural: true,
  },
  {
    id: 'M5',
    name: 'replay follow-latest site uses lastBar.t (skips helper)',
    needle: '                anchorTs = this._resolveTfSwitchRightEdgeAnchorTs(lastBar, lastIdx);',
    replacement: '                anchorTs = lastBar.t;',
    behavioural: true,
  },
  {
    id: 'M6',
    name: 'drop userOwnsViewport gate (panned users forced onto playhead/right-edge path)',
    needle: '        if (userOwnsViewport) {\n            // Panned / manual zoom: keep the left edge pinned at the same screen X.\n            anchorMode = \'viewportLeft\';',
    replacement: '        if (false && userOwnsViewport) {\n            // Panned / manual zoom: keep the left edge pinned at the same screen X.\n            anchorMode = \'viewportLeft\';',
    behavioural: true,
  },
];

console.log('=== TF-DOWNSHIFT-ANCHOR mutation set ===');
console.log(`baseline sha256=${CANON_SHA.slice(0, 16)}…`);

// Baseline must be green.
{
  const base = runSuite();
  if (base.code !== 0) {
    console.error('FATAL: baseline suite not green');
    console.error(base.failed.join('\n'));
    process.exit(2);
  }
  console.log(`baseline: PASS (${base.failed.length} fails)`);
}

let survived = 0;
const rows = [];

for (const m of mutants) {
  let src = CANON_BYTES.toString('utf8');
  const a1 = applyOnce(src, m.needle, m.replacement, m.id);
  if (!a1.ok) {
    console.log(`MUTANT ${m.id} — ${a1.reason} — ${m.name}`);
    survived += 1;
    rows.push({ id: m.id, status: 'NOT_APPLIED', killedBy: [], name: m.name });
    continue;
  }
  src = a1.source;
  if (m.needle2) {
    const a2 = applyOnce(src, m.needle2, m.replacement2, `${m.id}.b`);
    if (!a2.ok) {
      console.log(`MUTANT ${m.id} — ${a2.reason} — ${m.name}`);
      survived += 1;
      rows.push({ id: m.id, status: 'NOT_APPLIED', killedBy: [], name: m.name });
      continue;
    }
    src = a2.source;
  }

  const mutBuf = Buffer.from(src, 'utf8');
  fs.writeFileSync(CANON, mutBuf);
  fs.writeFileSync(MIRROR, mutBuf);
  let result;
  try {
    result = runSuite();
  } finally {
    restoreAll();
  }

  const died = result.code !== 0 && result.failed.length > 0;
  // Also treat non-zero with no parsed fails as died (suite crash).
  const diedHard = result.code !== 0;
  if (!diedHard) survived += 1;
  const status = diedHard ? 'DIED' : 'SURVIVED';
  console.log(`MUTANT ${m.id} — ${status} — ${m.name}`);
  if (result.failed.length) {
    for (const f of result.failed) console.log(`    killed by cell: ${f}`);
  } else if (diedHard) {
    console.log('    killed by suite non-zero exit (no TAP not-ok parsed)');
  }
  rows.push({
    id: m.id,
    status,
    killedBy: result.failed,
    name: m.name,
    behavioural: m.behavioural,
  });
}

console.log(`\n${mutants.length} designed / ${survived} survived`);
if (survived !== 0) {
  console.error('REJECT: one or more mutants survived or were not applied');
  process.exit(1);
}
console.log('ALL MUTANTS KILLED');
