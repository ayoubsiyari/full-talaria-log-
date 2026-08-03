/**
 * SEAL-EVIDENCE-01 — make each gate state what its verdicts are worth.
 *
 * The policy is that a check which can only be performed statically must say so
 * in its own verdict rather than presenting as a pass. This inserts that line
 * into gates that do not have one.
 *
 * It deliberately inserts a `console.log`, not a test cell. A cell that always
 * passes would add another green to the sweep totals while proving nothing,
 * which is the exact disease — a declaration must not be able to be counted as
 * coverage.
 *
 *   node scripts/seal-evidence-declare.mjs --check   report only, change nothing
 *   node scripts/seal-evidence-declare.mjs --write   insert the missing lines
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error('SEAL_EVIDENCE_DECLARE_ROOT_NOT_FOUND');
}
const ROOT = findRoot(__dirname);
const MARKER = 'SEAL-EVIDENCE-01';

const WORDING = {
  STATIC_SOURCE:
    'STATIC_SOURCE — every verdict below was decided by matching text in a source file. '
    + 'It proves a marker is PRESENT. It cannot show the path runs, in this build or any build.',
  SANDBOX_SIM:
    'SANDBOX_SIM — product source is executed here in a synthetic realm against stubs this '
    + 'gate wrote. Green means the logic behaves against those stubs, NOT that the shipped '
    + 'product does. A row can be green here and inert in the browser.',
  RUNTIME_MODULE:
    'RUNTIME_MODULE — the real module is imported and called in-process. Green is evidence '
    + 'about the module, NOT about served bytes: nothing here boots the built product.',
  RUNTIME_TOOL:
    'RUNTIME_TOOL — the real script under test is spawned and its exit code read. Green is '
    + 'evidence about the tool, NOT about served bytes.',
};

/** Canonical gate files, with the class the audit assigned. */
const TARGETS = [
  ['scripts/tests/build-id-refusal.test.mjs', 'RUNTIME_TOOL'],
  ['scripts/tests/clean-build-tree-guard.test.mjs', 'RUNTIME_TOOL'],
  ['_evidence/manager-B/passport3-commit-sha/passport3.test.mjs', 'RUNTIME_TOOL'],
  ['_evidence/manager-B/def05-bootstrap/def05a-canvas-context-recovery.test.mjs', 'SANDBOX_SIM'],
  ['_evidence/manager-B/def05-bootstrap/def05b-def07-bootstrap-defaults.test.mjs', 'SANDBOX_SIM'],
  ['_evidence/manager-B/life3-bfcache/life3-behavioural.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/order-01b-market-cursor.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/def04-multitf-time-sync.test.mjs', 'STATIC_SOURCE'],
  ['chart v 1.4/chart/modules/hostcache-panel-teardown-release.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/barstore-growth-bounds.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/p3-bar-store-realm.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/toolbar-pin-restore.test.mjs', 'RUNTIME_MODULE'],
  ['chart v 1.4/chart/modules/panel-state-binding.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/panel-state-roundtrip.test.mjs', 'RUNTIME_MODULE'],
  ['chart v 1.4/chart/modules/viewport-restore-consumer.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/drawing-import-coordinate.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/supporting-symbol-surface.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/session-symbol-restore.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/session-symbol-exclusivity.test.mjs', 'RUNTIME_TOOL'],
  ['chart v 1.4/chart/modules/server-write-failure-ledger.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/claim-failure-ledger.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/shell-play-override-receiver.test.mjs', 'SANDBOX_SIM'],
  ['chart v 1.4/chart/modules/shell-play-shipped-equivalence.test.mjs', 'SANDBOX_SIM'],
];

const mirrorOf = (rel) => (rel.startsWith('chart v 1.4/chart/')
  ? rel.replace('chart v 1.4/chart/', 'homepage/public/chart/') : null);

const write = process.argv.includes('--write');

/** Insert after the final top-level import so the line runs before any cell. */
function insert(src, cls) {
  const lines = src.split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i]) || /^const\s+\{[^}]*\}\s*=\s*require\(/.test(lines[i])) last = i;
  }
  if (last === -1) return null;
  const decl = `\nconsole.log('${MARKER} EVIDENCE CLASS: ${WORDING[cls].replace(/'/g, "\\'")}');`;
  lines.splice(last + 1, 0, decl);
  return lines.join('\n');
}

let changed = 0;
let already = 0;
let failed = 0;
for (const [rel, cls] of TARGETS) {
  const abs = path.join(ROOT, rel);
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { console.log(`  UNREADABLE  ${rel}`); failed += 1; continue; }
  if (src.includes(MARKER)) { already += 1; console.log(`  has it      ${rel}`); continue; }
  const next = insert(src, cls);
  if (next == null) { console.log(`  NO_ANCHOR   ${rel} — no import line to insert after`); failed += 1; continue; }
  console.log(`  ${write ? 'declared  ' : 'would add '}  ${cls.padEnd(15)} ${rel}`);
  if (write) {
    fs.writeFileSync(abs, next);
    const m = mirrorOf(rel);
    if (m && fs.existsSync(path.join(ROOT, m))) fs.writeFileSync(path.join(ROOT, m), next);
  }
  changed += 1;
}

console.log(`\n  ${changed} ${write ? 'declared' : 'would be declared'}, ${already} already had it, ${failed} could not be done.`);
if (!write) console.log('  (dry run — pass --write to apply)');
process.exitCode = failed > 0 ? 1 : 0;
