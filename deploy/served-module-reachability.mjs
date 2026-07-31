// Which modules in the served tree does no shell ever fetch?
//
// Answers two questions the Director framed as one: what do we ship that nobody loads, and what do
// we believe is fixed that nobody runs. A module that is committed, gated and green but unreachable
// from every shell is not fixed — it is decoration.
//
// METHOD, and its limits stated up front. This walks references from the HTML shells outward,
// following every quoted string that names a served file: <script src>, <link href>, import/export
// from, import(), require(), new Worker(), importScripts(), and plain path strings.
//
// Three classes, because "delete it" needs more confidence than "nobody linked it":
//   REACHED     - transitively referenced from a shell by an explicit path
//   NAMED-ONLY  - never path-referenced, but its basename or stem appears as a string inside
//                 reached code, so a computed loader (`modules/${name}.js`) might fetch it.
//                 NOT safe to delete.
//   ORPHAN      - name appears nowhere in any reached file. Safe to delete.
//
// Performance note: strings are extracted with a linear scanner rather than a regex. A regex with
// a backtick/quote alternation backtracks catastrophically on minified bundles — the first version
// of this file ran for twelve minutes on a 36 MB tree before being killed.
//
// Usage: node served-module-reachability.mjs <served-root> [--json]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, basename, posix } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT || !existsSync(ROOT)) {
  console.error('usage: node served-module-reachability.mjs <served-root> [--json]');
  process.exit(2);
}
const JSON_OUT = process.argv.includes('--json');
const CODE = /\.(js|mjs|cjs)$/i;
const HTML = /\.html?$/i;
const SCANNABLE = /\.(js|mjs|cjs|html?|json|css)$/i;
const MAX_SCAN = 12 * 1024 * 1024;

function walk(dir, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else out.push({ path: p, size: st.size });
  }
  return out;
}

const all = walk(ROOT);
const rel = (p) => relative(ROOT, p).split('\\').join('/');
const byRel = new Map(all.map((f) => [rel(f.path), f]));
const codeFiles = all.filter((f) => CODE.test(f.path));
const shells = all.filter((f) => HTML.test(f.path)).map((f) => rel(f.path));

// Linear scanner: collect quoted-string contents without regex backtracking.
function stringsIn(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = text.indexOf(c, i + 1);
      if (end === -1) { i += 1; continue; }
      const len = end - i - 1;
      if (len >= 2 && len <= 240) {
        const s = text.slice(i + 1, end);
        if (s.indexOf('\n') === -1) out.push(s);
      }
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

function resolveRef(fromRel, ref) {
  let r = ref.trim();
  if (!r || r.length > 240) return null;
  if (r.charCodeAt(0) === 100 && /^data:/i.test(r)) return null;
  if (/^(blob:|https?:|\/\/)/i.test(r)) return null;
  r = r.split('?')[0].split('#')[0];
  if (!r || !/[./]/.test(r)) return null;
  const cands = r.startsWith('/')
    ? [r.slice(1), r.replace(/^\/chart\//, '')]
    : [posix.normalize(posix.join(posix.dirname(fromRel), r))];
  for (const c of cands) {
    const k = c.replace(/^\.\//, '');
    if (byRel.has(k)) return k;
    if (byRel.has(k + '.js')) return k + '.js';
    if (byRel.has(k + '.mjs')) return k + '.mjs';
  }
  return null;
}

// One pass: BFS from the shells, collecting both edges and every string mentioned in reached code.
const reached = new Set();
const mentioned = new Set();
const queue = [...shells];
let scanned = 0;

while (queue.length) {
  const cur = queue.pop();
  if (reached.has(cur)) continue;
  reached.add(cur);
  const f = byRel.get(cur);
  if (!f || !SCANNABLE.test(cur) || f.size > MAX_SCAN) continue;
  let text = '';
  try { text = readFileSync(f.path, 'utf8'); } catch { continue; }
  scanned += 1;
  for (const s of stringsIn(text)) {
    mentioned.add(s);
    const target = resolveRef(cur, s);
    if (target && !reached.has(target)) queue.push(target);
  }
}

// A file counts as "named" if its basename or stem is mentioned anywhere in reached code. Checking
// membership of a Set of strings, rather than substring-scanning a concatenation of the whole tree.
const mentionedBases = new Set();
for (const s of mentioned) {
  const b = s.split('?')[0].split('#')[0];
  const last = b.slice(b.lastIndexOf('/') + 1);
  if (last) {
    mentionedBases.add(last);
    mentionedBases.add(last.replace(CODE, ''));
  }
}

const rows = codeFiles.map((f) => {
  const r = rel(f.path);
  const b = basename(r);
  let cls;
  if (reached.has(r)) cls = 'REACHED';
  else if (mentionedBases.has(b) || mentionedBases.has(b.replace(CODE, ''))) cls = 'NAMED-ONLY';
  else cls = 'ORPHAN';
  return { path: r, size: f.size, cls };
});

const sum = (a) => a.reduce((x, y) => x + y.size, 0);
const pick = (c) => rows.filter((r) => r.cls === c).sort((a, b) => b.size - a.size);
const orphans = pick('ORPHAN');
const namedOnly = pick('NAMED-ONLY');
const reachedRows = pick('REACHED');

if (JSON_OUT) {
  console.log(JSON.stringify({
    shells, rows,
    totals: {
      files: rows.length, bytes: sum(rows),
      reached: reachedRows.length, reachedBytes: sum(reachedRows),
      namedOnly: namedOnly.length, namedOnlyBytes: sum(namedOnly),
      orphan: orphans.length, orphanBytes: sum(orphans),
    },
  }, null, 2));
} else {
  console.log(`served root        : ${ROOT}`);
  console.log(`shells (entry HTML): ${shells.length}`);
  console.log(`files scanned      : ${scanned}`);
  console.log(`code files         : ${rows.length}  (${sum(rows).toLocaleString()} bytes)`);
  console.log(`  REACHED          : ${reachedRows.length}  (${sum(reachedRows).toLocaleString()} bytes)`);
  console.log(`  NAMED-ONLY       : ${namedOnly.length}  (${sum(namedOnly).toLocaleString()} bytes)  <- computed path possible; NOT safe to delete`);
  console.log(`  ORPHAN           : ${orphans.length}  (${sum(orphans).toLocaleString()} bytes)  <- named nowhere in reached code`);
  console.log('');
  console.log('LARGEST ORPHANS:');
  for (const o of orphans.slice(0, 30)) console.log(`  ${String(o.size).padStart(9)}  ${o.path}`);
  console.log('');
  console.log('NAMED-ONLY (confirm the load path before touching):');
  for (const o of namedOnly.slice(0, 25)) console.log(`  ${String(o.size).padStart(9)}  ${o.path}`);
  console.log('');
  console.log('INDICATOR IMPLEMENTATIONS, classified:');
  for (const r of rows.filter((x) => /chart-indicators/i.test(x.path)).sort((a, b) => b.size - a.size)) {
    console.log(`  ${r.cls.padEnd(11)} ${String(r.size).padStart(9)}  ${r.path}`);
  }
}
