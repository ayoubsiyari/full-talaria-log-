/**
 * Which bumpDataVersion() sites are on the PER-TICK path?
 *
 * This is the load-bearing claim in my own 'row-resample-above-paint-boundary':
 * if dataVersion bumps on a forming tick, the display cache-hit branch
 * (chart-data-pipeline.js:78-86) fails, the incremental branch fails too
 * (it needs sourceLen === source.length-1, false when the last bar is mutated
 * in place), and every tick pays a FULL re-resample in every realm.
 *
 * If dataVersion does NOT bump on a forming tick, the cache hits and my row
 * is wrong. Verify, do not assert.
 *
 * Static only.
 */
import fs from 'node:fs';

const F = 'chart v 1.4/chart/modules/replay-system.js';
const src = fs.readFileSync(F, 'utf8');
const lines = src.split('\n');

// Find the nearest enclosing function/method declaration above a line.
const DECL = /^\s*(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/;
function enclosing(idx) {
  for (let i = idx; i >= 0 && i > idx - 400; i -= 1) {
    const m = lines[i].match(DECL);
    if (m && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(m[1])) {
      return { name: m[1], line: i + 1 };
    }
  }
  return { name: '(unresolved)', line: -1 };
}

const hits = [];
lines.forEach((l, i) => { if (l.includes('bumpDataVersion')) hits.push(i); });

// Collapse the two-line `if (typeof ...)` / `bump()` pairs into one report row.
const seen = new Set();
console.log(`bumpDataVersion sites in ${F}: ${hits.length} raw lines\n`);
for (const i of hits) {
  const enc = enclosing(i);
  const key = `${enc.name}@${enc.line}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(`  line ${String(i + 1).padStart(5)}  in  ${enc.name}()  [declared line ${enc.line}]`);
}

// Now: which of those names look tick/forming-bar shaped, and are they called per tick?
console.log('\n=== do the enclosing functions name the per-tick forming-bar path? ===');
const TICKY = /tick|forming|animate|advance|step|play|smooth|sub|interp/i;
for (const key of seen) {
  const name = key.split('@')[0];
  console.log(`  ${name.padEnd(46)} ${TICKY.test(name) ? '<-- TICK-SHAPED' : ''}`);
}

console.log('\n=== POSITIVE CONTROL: the enclosing-function resolver works ===');
// Pick three known method names and confirm the resolver finds them from inside.
for (const probe of ['applyAnimatedCandleToFormingBar', 'startReplayAtIndex', 'goToReplayTimestamp']) {
  const at = lines.findIndex((l) => l.includes(`${probe}(`));
  console.log(`  ${probe.padEnd(34)} first mention line ${at + 1}, resolver from there -> ${at >= 0 ? enclosing(at).name : 'NOT FOUND'}`);
}

console.log('\n=== does the forming-bar mutation path bump? (search its body) ===');
const formIdx = lines.findIndex((l) => /applyAnimatedCandleToFormingBar\s*\(/.test(l) && /\{\s*$/.test(l));
if (formIdx === -1) {
  console.log('  applyAnimatedCandleToFormingBar declaration NOT FOUND - inconclusive, do not infer');
} else {
  let depth = 0; let end = formIdx;
  for (let i = formIdx; i < Math.min(lines.length, formIdx + 400); i += 1) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (i > formIdx && depth <= 0) { end = i; break; }
  }
  const body = lines.slice(formIdx, end + 1).join('\n');
  console.log(`  body lines ${formIdx + 1}..${end + 1} (${end - formIdx + 1} lines)`);
  for (const n of ['bumpDataVersion', 'dataVersion', 'push(', 'length']) {
    console.log(`    ${n.padEnd(18)} = ${(body.match(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length}`);
  }
}
