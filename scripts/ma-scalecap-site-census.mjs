/**
 * MA-SCALECAP site census with POSITIVE CONTROLS.
 *
 * Every "this is absent" count is paired with a pattern in the SAME file that
 * is known to be present, so a zero cannot be mistaken for a working search.
 * Defaults to the base commit (the pre-fix state the brief describes).
 *
 *   node scripts/ma-scalecap-site-census.mjs [rev]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANONICAL = 'chart v 1.4/chart/modules/order-manager.js';
const rev = process.argv[2] === 'WORKING' ? null : (process.argv[2] || '79625eac6');

const src = rev
  ? execFileSync('git', ['show', `${rev}:${CANONICAL}`], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true,
  })
  : fs.readFileSync(path.join(ROOT, CANONICAL), 'utf8');

const lines = src.split('\n');
console.log(`source: ${CANONICAL} @ ${rev || 'WORKING_TREE'}  (${lines.length} lines, ${src.length} bytes)`);
if (src.length < 1_000_000) {
  console.error('FAIL: source looks truncated / mis-decoded — refusing to report counts');
  process.exit(1);
}

function hits(re, text = src) {
  const out = [];
  const rx = new RegExp(re, 'g');
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(re).test(lines[i])) { out.push(i + 1); }
  }
  n = (text.match(rx) || []).length;
  return { n, lineNos: out };
}

function report(kind, label, re, text) {
  const { n, lineNos } = hits(re, text);
  const shown = lineNos.length > 14 ? `${lineNos.slice(0, 14).join(',')},…` : lineNos.join(',');
  console.log(`${String(n).padStart(4)}  ${kind.padEnd(8)} ${label}${lineNos.length ? `  @ ${shown}` : ''}`);
  return n;
}

console.log('\n── MAX_ENTRY_LEVELS ────────────────────────────────────────────────');
report('COUNT', 'MAX_ENTRY_LEVELS (declaration + every reader)', 'MAX_ENTRY_LEVELS');
report('CONTROL', 'MAX_TP_TARGETS (known present, same file)', 'MAX_TP_TARGETS');

console.log('\n── entry-level cap predicate ───────────────────────────────────────');
report('COUNT', '_canAddMoreMultiEntryLevels (definition + call sites)', '_canAddMoreMultiEntryLevels');
report('CONTROL', '_canAddMoreTpTargets (known present, same file)', '_canAddMoreTpTargets');

console.log('\n── writers into a trade group\'s entries[] ───────────────────────────');
report('COUNT', '<group>.entries.push(...)', '\\.entries\\.push\\(');
report('COUNT', '<group>.entries = <assignment>', '\\w+\\.entries = [^=]');
report('COUNT', 'entries: [ ... ] inside a group literal', 'entries: \\[');
report('CONTROL', '.entries any member access (known present)', '\\.entries[.\\[]');

console.log('\n── writers into multiEntryLevels[] (the CAPPED structure) ───────────');
report('COUNT', 'this.multiEntryLevels.push(', 'multiEntryLevels\\.push\\(');
report('COUNT', 'this.multiEntryLevels = <assignment>', 'multiEntryLevels = [^=]');
report('CONTROL', 'multiEntryLevels any mention (known present)', 'multiEntryLevels');

console.log('\n── entryScreenshots: is it independently indexed? ───────────────────');
report('ABSENT?', 'entryScreenshots[<expr>] = <write>  (parallel-index write)', 'entryScreenshots\\[[^\\]]+\\]\\s*=[^=]');
report('ABSENT?', 'entryScreenshots.push(', 'entryScreenshots\\.push\\(');
report('COUNT', 'entryScreenshots = <whole-array assignment>', 'entryScreenshots = [^=]');
report('COUNT', 'entryScreenshots: <derivation in an object literal>', 'entryScreenshots:');
report('CONTROL', 'entryScreenshots any mention (known present)', 'entryScreenshots');

console.log('\n── inside applyScaling() only ───────────────────────────────────────');
const start = lines.findIndex((l) => /^\s{4}applyScaling\(order\) \{/.test(l));
if (start < 0) {
  console.error('FAIL: applyScaling(order) not found — census cannot be trusted');
  process.exit(1);
}
let end = start;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i] === '    }') { end = i; break; }
}
const body = lines.slice(start, end + 1).join('\n');
console.log(`applyScaling() spans lines ${start + 1}-${end + 1}`);
const capInside = (body.match(/MAX_ENTRY_LEVELS|_canAddMoreMultiEntryLevels|_scaleInEntryCapV1Enabled/g) || []).length;
const pushInside = (body.match(/group\.entries\.push/g) || []).length;
const gidInside = (body.match(/tradeGroupId/g) || []).length;
console.log(`${String(capInside).padStart(4)}  ABSENT?  cap symbols inside applyScaling`);
console.log(`${String(pushInside).padStart(4)}  CONTROL  group.entries.push inside applyScaling (known present)`);
console.log(`${String(gidInside).padStart(4)}  CONTROL  tradeGroupId inside applyScaling (known present)`);
