/**
 * SEAL-EVIDENCE-01 — what kind of evidence does each gate actually produce?
 *
 * Three times in twelve hours a gate reported green while proving nothing:
 * FRAME-01 green with replay exempt, two mirrored gates that never executed,
 * two panel-state gates that parsed nothing. Same disease, three costumes. The
 * costume is always the same lie — a verdict line that says PASS when the check
 * behind it could only ever have inspected source.
 *
 * This does not grade gates. It reads what each one *executes* and prints the
 * strongest evidence class it can actually reach, so a row's claim can be
 * compared against its instrument. Source evidence cannot bless served bytes.
 *
 * Classes, weakest to strongest:
 *
 *   STATIC_SOURCE   reads files and matches text. Proves a marker is PRESENT.
 *                   Cannot show the path runs, in this build or any build.
 *   SANDBOX_SIM     executes product source in a synthetic realm. Proves the
 *                   logic behaves, against stubs the gate itself wrote.
 *   RUNTIME_MODULE  imports and calls the real module in-process.
 *   RUNTIME_TOOL    spawns the real script or binary and reads its exit code.
 *   SERVED_SMOKE    drives a served surface over HTTP.
 *   RUNTIME_BROWSER boots the built product in a browser and observes it.
 *
 * BIND-01. A gate that cannot be classified must say so rather than defaulting
 * to the weakest or the strongest class, because both are a guess wearing a
 * verdict:
 *
 *   FILE_UNREADABLE     the gate could not be read at all
 *   NO_SIGNALS          nothing matched; the classifier has lost its grip and
 *                       its silence must not read as STATIC_SOURCE
 *
 * A gate whose strongest class is STATIC_SOURCE is not thereby broken. It is
 * only broken if it does not SAY SO in its own output. That is the column that
 * matters here: `declares`.
 *
 *   node scripts/seal-evidence-audit.mjs
 *   node scripts/seal-evidence-audit.mjs --json=docs/plan3/evidence/seal-evidence-audit.json
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
  throw new Error('SEAL_EVIDENCE_AUDIT_ROOT_NOT_FOUND');
}
const ROOT = findRoot(__dirname);

/** Manager B's lane. Canonical paths; mirrors are resolved and audited too. */
const LANE = [
  ['BUILD-ID-01', 'scripts/tests/build-id-refusal.test.mjs'],
  ['CLEAN-TREE-01', 'scripts/tests/clean-build-tree-guard.test.mjs'],
  ['REBUILD-CONSTRAINT', 'scripts/rebuild-constraint-check.mjs'],
  ['PASSPORT-3-REPO', '_evidence/manager-B/passport3-commit-sha/passport3.test.mjs'],
  ['PASSPORT-3-LIVE', '_evidence/manager-B/passport3-commit-sha/passport3-verify.mjs'],
  ['DEF-05a', '_evidence/manager-B/def05-bootstrap/def05a-canvas-context-recovery.test.mjs'],
  ['DEF-05b/DEF-07', '_evidence/manager-B/def05-bootstrap/def05b-def07-bootstrap-defaults.test.mjs'],
  ['LIFE-3', '_evidence/manager-B/life3-bfcache/life3-behavioural.test.mjs'],
  ['HOSTCACHE-TEARDOWN', 'chart v 1.4/chart/modules/hostcache-panel-teardown-release.test.mjs'],
  ['BARSTORE-1/2', 'chart v 1.4/chart/modules/barstore-growth-bounds.test.mjs'],
  ['P3-BAR-STORE-REALM', 'chart v 1.4/chart/modules/p3-bar-store-realm.test.mjs'],
  ['TAL-01865-PINS', 'chart v 1.4/chart/modules/toolbar-pin-restore.test.mjs'],
  ['TAL-01865-PANEL-BIND', 'chart v 1.4/chart/modules/panel-state-binding.test.mjs'],
  ['TAL-01865-PANEL-RT', 'chart v 1.4/chart/modules/panel-state-roundtrip.test.mjs'],
  ['TAL-01865-VIEWPORT', 'chart v 1.4/chart/modules/viewport-restore-consumer.test.mjs'],
  ['TAL-01865-DRAWIMPORT', 'chart v 1.4/chart/modules/drawing-import-coordinate.test.mjs'],
  ['RAYAN8-SUPPORT', 'chart v 1.4/chart/modules/supporting-symbol-surface.test.mjs'],
  ['SESSION-SYM-RESTORE', 'chart v 1.4/chart/modules/session-symbol-restore.test.mjs'],
  ['SESSION-SYM-EXCL', 'chart v 1.4/chart/modules/session-symbol-exclusivity.test.mjs'],
  ['SERVER-WRITE-12', 'chart v 1.4/chart/modules/server-write-failure-ledger.test.mjs'],
  ['CLAIM-FAILURE-13', 'chart v 1.4/chart/modules/claim-failure-ledger.test.mjs'],
  ['SHELL-PLAY-RECEIVER', 'chart v 1.4/chart/modules/shell-play-override-receiver.test.mjs'],
  ['SHELL-PLAY-SHIPPED', 'chart v 1.4/chart/modules/shell-play-shipped-equivalence.test.mjs'],
  ['SHELLPLAY-GUARD', 'scripts/shellplay-guard-attribution-probe.mjs'],
  // Handed/integrated rows still in B's seal presentation surface:
  ['ORDER-01B', 'chart v 1.4/chart/modules/order-01b-market-cursor.test.mjs'],
  ['DEF-04', 'chart v 1.4/chart/modules/def04-multitf-time-sync.test.mjs'],
];

const CLASSES = [
  'STATIC_SOURCE', 'SANDBOX_SIM', 'RUNTIME_MODULE', 'RUNTIME_TOOL', 'SERVED_SMOKE', 'RUNTIME_BROWSER',
];
const rank = (c) => CLASSES.indexOf(c);

/**
 * Signals are deliberately narrow. A loose signal that over-credits a gate is
 * worse than no classifier, because it launders a static check into a runtime
 * claim — which is the exact failure this exists to catch.
 */
const SIGNALS = [
  ['RUNTIME_BROWSER', /puppeteer|loadPuppeteer|page\.evaluate/],
  // passport3-verify does `await fetch(url, …)` — variable URL, no literal https:.
  // Do NOT key on the string `build-info.json`: the repo gate mentions it
  // constantly while only spawning the emitter, and that laundered RUNTIME_TOOL
  // into SERVED_SMOKE on the first cut of this signal.
  ['SERVED_SMOKE', /startHarnessServer|startServer\s*\(|fetch\s*\(\s*[`'"]https?:|await\s+fetch\s*\(\s*url\b|http\.get\s*\(/],
  // Spawning a subprocess is only runtime evidence when the subprocess IS the
  // thing under test. The first cut of this classifier credited
  // REBUILD-CONSTRAINT as RUNTIME_TOOL on the strength of `execFileSync('git',
  // ['show', ...])` — provenance plumbing, not product execution — and so
  // reported it STRONGER than the gate honestly reports itself. A classifier
  // that launders a static check into a runtime claim is the disease it is
  // supposed to be hunting, so the spawn target has to be inspected.
  ['RUNTIME_TOOL', /(?:execFileSync|spawnSync|execSync)\s*\(\s*(?!['"`](?:git|curl|docker|npm|node|bash|sh|powershell)['"`])/],
  ['SANDBOX_SIM', /vm\.createContext|vm\.runInNewContext|new vm\.Script|runInContext/],
  ['RUNTIME_MODULE', /await import\s*\(|\bfrom\s+['"](\.\.?\/)[^'"]+\.js['"]/],
  ['STATIC_SOURCE', /readFileSync|fs\.readFile/],
];

/**
 * The per-file class is the CEILING, not the claim. A gate with twenty
 * text-matching cells and one that executes something reports the strong class
 * while nineteen of its twenty verdicts rest on a regex. That is the panel-state
 * shape exactly. So measure the share of assertions that can only ever be text
 * matching, and report it next to the class.
 */
const TEXT_ASSERT = new RegExp([
  // assert.match(src, /re/) — the obvious one
  /assert\.(?:match|doesNotMatch)\s*\(/.source,
  // assert.ok(src.includes(...)) and assert.ok(/re/.test(src))
  /assert\.ok\s*\([^;]{0,160}?\.(?:includes|test|startsWith|endsWith)\s*\(/.source,
  // assert.notEqual(src.indexOf(...), -1) — the shape most binding cells use
  /assert\.(?:notEqual|notStrictEqual|equal|strictEqual)\s*\([^;]{0,160}?\.indexOf\s*\(/.source,
  // assert.ok(src.indexOf(...) >= 0)
  /assert\.ok\s*\([^;]{0,160}?\.indexOf\s*\(/.source,
].join('|'), 'g');
const ANY_ASSERT = /assert\b[.(]/g;
function assertionMix(src) {
  const text = (src.match(TEXT_ASSERT) || []).length;
  const all = (src.match(ANY_ASSERT) || []).length;
  return { textAsserts: text, allAsserts: all, share: all ? text / all : null };
}

/** Does the gate already announce what its evidence is worth? */
const DECLARES = /EVIDENCE[_ ]CLASS|STATIC_BYTES|STATIC_SOURCE|STATIC_ONLY|SEAL-EVIDENCE-01|SANDBOX_SIM|RUNTIME_MODULE|RUNTIME_TOOL|SOURCE[- ]ONLY|does not prove.{0,40}runs|PRESENT, not that/i;

function classify(abs) {
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch { return { state: 'FILE_UNREADABLE' }; }
  const found = SIGNALS.filter(([, re]) => re.test(src)).map(([c]) => c);
  if (!found.length) return { state: 'NO_SIGNALS', bytes: src.length };
  const strongest = found.reduce((a, b) => (rank(b) > rank(a) ? b : a), found[0]);
  return {
    state: 'CLASSIFIED',
    strongest,
    all: found,
    declares: DECLARES.test(src),
    bytes: src.length,
    ...assertionMix(src),
  };
}

function mirrorOf(rel) {
  if (!rel.startsWith('chart v 1.4/chart/')) return null;
  return rel.replace('chart v 1.4/chart/', 'homepage/public/chart/');
}

const argOf = (n, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const rows = [];
for (const [id, rel] of LANE) {
  for (const [kind, p] of [['canonical', rel], ['mirror', mirrorOf(rel)]]) {
    if (!p) continue;
    const abs = path.join(ROOT, p);
    if (kind === 'mirror' && !fs.existsSync(abs)) continue;
    rows.push({ id, kind, path: p, ...classify(abs) });
  }
}

console.log('\nSEAL-EVIDENCE-01 — evidence class by what each gate executes\n');
/** Only these two can observe a BUILT product rather than its source. */
const OBSERVES_BUILD = new Set(['RUNTIME_BROWSER', 'SERVED_SMOKE']);

console.log('  row                      kind       ceiling class      observes  text-asserts  declares');
let undeclared = 0;
let unclassified = 0;
let cannotObserve = 0;
for (const r of rows) {
  if (r.state !== 'CLASSIFIED') {
    unclassified += 1;
    console.log(`  ${r.id.padEnd(24)} ${r.kind.padEnd(10)} ${r.state.padEnd(18)} ${'-'.padEnd(9)} ${'-'.padEnd(13)} -`);
    continue;
  }
  const pct = r.share == null ? null : Math.round(r.share * 100);
  const observes = OBSERVES_BUILD.has(r.strongest);
  if (!observes) cannotObserve += 1;
  // SEAL-EVIDENCE-01 as written: a check that can only be performed statically
  // must SAY SO in its own verdict. Anything that cannot observe a built
  // product is in that category, whatever it executes internally.
  const bad = !observes && !r.declares;
  if (bad) undeclared += 1;
  const mix = pct == null ? 'none' : `${r.textAsserts}/${r.allAsserts} = ${pct}%`;
  console.log(
    `  ${r.id.padEnd(24)} ${r.kind.padEnd(10)} ${r.strongest.padEnd(18)}`
    + ` ${(observes ? 'build' : 'SOURCE').padEnd(9)} ${mix.padEnd(13)}`
    + ` ${(r.declares ? 'yes' : 'NO')}${bad ? '  <-- SEAL-EVIDENCE-01' : ''}`,
  );
}

console.log(`\n  ${rows.length} gate files audited.`);
console.log(`  ${cannotObserve} cannot observe a built product at all — they read source or run it in a`);
console.log('  synthetic realm, so no verdict they print is evidence about served bytes.');
console.log(`  ${undeclared} of those do NOT say so in their own output. That is the violation.`);
if (unclassified) console.log(`  ${unclassified} could not be classified — treat as unknown, not as pass.`);
console.log('\n  LIMITS OF THIS AUDIT, so it does not become the next false green:');
console.log('   - `ceiling class` is the strongest thing the FILE reaches, not what any given');
console.log('     cell used. A file can reach SANDBOX_SIM in one cell and match text in twenty.');
console.log('   - `text-asserts` is a LOWER BOUND from assertion shapes. It undercounts, so a');
console.log('     low number is not a clean bill.');
console.log('   - Passing this audit means a gate is HONEST about its class, not that the row');
console.log('     it guards is covered. Coverage still needs a run against the sealed build.\n');

const out = argOf('json');
if (out) {
  const abs = path.resolve(ROOT, out);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify({
    signature: 'SEAL-EVIDENCE-AUDIT-V1',
    at: new Date().toISOString(),
    rows,
    undeclared,
    cannotObserve,
    unclassified,
  }, null, 2));
  console.log(`  artifact: ${out}\n`);
}

process.exitCode = undeclared > 0 || unclassified > 0 ? 1 : 0;
