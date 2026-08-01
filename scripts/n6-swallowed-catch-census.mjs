#!/usr/bin/env node
/**
 * N6 — the swallowed-catch{} census. Static, zero territory conflict.
 *
 * WHY THIS IS NOT BOOKKEEPING. Nearly every defect that cost this investigation a night was an error
 * that happened and said nothing: a session that ran at 60x under a 5x label because the speed argument
 * was silently discarded; a hook passed to a function that does not take it, dropped without a word; a
 * PowerShell .Replace() whose anchor missed, returning the string unchanged so a full trace ran against
 * code that was not there. Each was a swallowed failure. The product has the same class, and when it
 * swallows one during a ten-hour soak the artifact records a number instead of a fault.
 *
 * The census ranks by BLAST RADIUS, not by count. An empty catch around a cosmetic DOM read is noise; an
 * empty catch around a fetch, a worker message, a storage write or a replay step is a place where the
 * chart can be quietly wrong for ten hours, which is exactly the failure mode we cannot currently see.
 */
import fs from 'node:fs';
import path from 'node:path';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const ROOT = 'chart v 1.4/chart';

const files = [];
const walk = (dir, depth = 0) => {
  if (depth > 4) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git|dist-v9|vendor/.test(e.name)) walk(p, depth + 1); }
    else if (/\.(js|mjs)$/.test(e.name) && !/\.test\.|\.min\./.test(e.name)) files.push(p);
  }
};
walk(ROOT);

// A catch is "swallowed" when its body carries no statement: empty, or comments and whitespace only.
const bodyIsSilent = (body) => {
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trim();
  return stripped.length === 0;
};

// Ranked by what the swallowed failure can hide. These are the surfaces where a silent error becomes a
// wrong number rather than a cosmetic glitch.
const RISK = [
  { level: 'CRITICAL', why: 'network or parse — a swallowed failure here returns stale or partial data and the chart renders it as truth', re: /\b(fetch|XMLHttpRequest|JSON\.parse|\.json\(\)|await\s+res)/i },
  { level: 'CRITICAL', why: 'replay or bar data — a swallowed failure here corrupts the series a ten-hour verdict is computed from', re: /\b(replay|currentIndex|rawData|fullData|bars?\b|candle)/i },
  { level: 'HIGH', why: 'worker or postMessage — a swallowed failure here silently drops a recalculation', re: /\b(Worker|postMessage|onmessage|terminate)\b/ },
  { level: 'HIGH', why: 'storage or persistence — a swallowed failure here loses user state without telling anyone', re: /\b(localStorage|sessionStorage|indexedDB|caches)\b/ },
  { level: 'MEDIUM', why: 'orders or positions — a swallowed failure here can desynchronise the book from the chart', re: /\b(order|position|trade|pnl)/i },
  { level: 'LOW', why: 'DOM or layout read — usually cosmetic', re: /\b(document|element|style|classList|getBoundingClientRect|canvas)/i },
];

/**
 * Walk backwards from a `catch` to the body of the `try` it belongs to, brace-matching so a nested block
 * does not terminate the search early. Returns '' when the try cannot be resolved, which is honest: an
 * unresolved try must not inherit a risk level from whatever text happened to be nearby.
 */
function matchingTryBody(src, catchIndex) {
  let i = src.lastIndexOf('}', catchIndex);
  if (i < 0) return '';
  let depth = 1;
  i -= 1;
  while (i >= 0 && depth > 0) {
    const c = src[i];
    if (c === '}') depth += 1;
    else if (c === '{') depth -= 1;
    i -= 1;
  }
  if (depth !== 0) return '';
  const open = i + 1;
  const head = src.slice(Math.max(0, open - 12), open);
  if (!/\btry\s*$/.test(head)) return '';
  return src.slice(open + 1, src.lastIndexOf('}', catchIndex));
}

const findings = [];
for (const file of files) {
  let src = '';
  try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }

  // Brace-matched catch bodies.
  const re = /\bcatch\s*(\([^)]*\))?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      i += 1;
    }
    const body = src.slice(m.index + m[0].length, i - 1);
    if (!bodyIsSilent(body)) continue;

    const line = src.slice(0, m.index).split('\n').length;
    // Classify on the MATCHING TRY BLOCK ONLY. A first pass scanned the preceding 700 characters and
    // returned 531 CRITICAL, whose top site was `getCandleSpacing()` - flagged because the word "candle"
    // happened to appear nearby. In dense code a wide window matches everything, which produces an
    // alarming number that means nothing. The try block is what was actually attempted.
    const tryBody = matchingTryBody(src, m.index);
    const risk = RISK.find((r) => r.re.test(tryBody)) || { level: 'UNCLASSIFIED', why: 'no recognised surface inside the try block' };
    const before = tryBody;
    findings.push({
      file: file.replace(/\\/g, '/'),
      line,
      catchClause: (m[1] || '(no binding)').trim(),
      risk: risk.level,
      why: risk.why,
      attempted: before.split('\n').slice(-4).join(' ').replace(/\s+/g, ' ').trim().slice(-150),
    });
  }

  // The promise form, which is the same defect wearing a different shape.
  const pre = /\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(\{\s*\}|null|undefined|void 0)\s*\)/g;
  while ((m = pre.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    // A promise chain has no try block, so the expression it hangs off IS the attempt. Narrow window.
    const before = src.slice(Math.max(0, m.index - 200), m.index);
    const risk = RISK.find((r) => r.re.test(before)) || { level: 'UNCLASSIFIED', why: 'no recognised surface in the chained expression' };
    findings.push({
      file: file.replace(/\\/g, '/'), line, catchClause: `.catch(=> ${m[1]})`,
      risk: risk.level, why: risk.why, promiseForm: true,
      attempted: before.split('\n').slice(-3).join(' ').replace(/\s+/g, ' ').trim().slice(-150),
    });
  }
}

const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNCLASSIFIED'];
findings.sort((a, b) => order.indexOf(a.risk) - order.indexOf(b.risk) || a.file.localeCompare(b.file) || a.line - b.line);

const byRisk = Object.fromEntries(order.map((l) => [l, findings.filter((f) => f.risk === l).length]));
const byFile = {};
for (const f of findings) byFile[f.file] = (byFile[f.file] || 0) + 1;
const topFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 12);

const report = {
  signature: 'N6-SWALLOWED-CATCH-CENSUS-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — static source analysis, no browser.',
  scope: { root: ROOT, filesScanned: files.length, findings: findings.length },
  byRisk,
  topFiles: topFiles.map(([f, n]) => ({ file: f, silentCatches: n })),
  method: 'Brace-matched catch bodies that contain no statement (comments and whitespace do not count as handling), plus the .catch(() => {} | null | undefined) promise form. Risk is assigned from the MATCHING TRY BLOCK, brace-matched backwards from the catch - what was actually attempted. A first pass used a 700-character window and returned 531 CRITICAL whose top site was getCandleSpacing(), flagged because the word candle appeared nearby.',
  limits: [
    'A silent catch is not automatically a defect. Some are deliberate and correct — reading a cross-origin frame, or probing for a field that may not exist. This is a census with a risk ranking, NOT a defect list, and nothing here should be "fixed" without reading the site.',
    'Risk is inferred from surrounding text, so it is a triage heuristic and not a proof of what the code does.',
    'Scanned the source tree, which is 20260724b61 and NOT the deployed build. Counts describe the tree.',
  ],
  whyItMatters: 'Nearly every night this investigation lost was lost to a failure that happened and said nothing — a speed argument silently discarded, a hook silently dropped, a patch anchor that silently missed. The product carries the same class, and a swallowed failure during a ten-hour soak records a number instead of a fault.',
  findings: findings.slice(0, 400),
};

fs.writeFileSync(path.join(EV, 'N6-SWALLOWED-CATCH-CENSUS.json'), JSON.stringify(report, null, 1));

console.log(`\nN6 — SWALLOWED-CATCH CENSUS\n`);
console.log(`  ${files.length} files scanned, ${findings.length} silent catches\n`);
for (const l of order) if (byRisk[l]) console.log(`    ${l.padEnd(13)} ${String(byRisk[l]).padStart(4)}`);
console.log('\n  Most affected files:');
for (const [f, n] of topFiles) console.log(`    ${String(n).padStart(4)}  ${f}`);
console.log('\n  Highest-blast-radius sites (first 12 CRITICAL):');
for (const f of findings.filter((x) => x.risk === 'CRITICAL').slice(0, 12)) {
  console.log(`    ${f.file}:${f.line}  ${f.catchClause}`);
  console.log(`        attempting: ...${f.attempted.slice(-95)}`);
}
console.log('');
