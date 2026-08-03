/**
 * ROOT-DEPTH-01 — how many gates anchor themselves by counting directory levels,
 * and how many of those have never executed in one of their two locations.
 *
 * B found both mirrored panel-state gates resolving ROOT as `../../..`. From the
 * canonical `chart v 1.4/chart/modules/` that is the repo root; from the mirror
 * `homepage/public/chart/modules/` it is one level short and lands on
 * `homepage/`. The mirrored copies died on load with ENOENT and had never run.
 *
 * The reason this matters more than an ordinary red: a gate that dies on load
 * looks exactly like a gate that ran and failed, and in a sweep that counts
 * files rather than assertions it can also look like one that passed. Our green
 * totals include copies that have never executed a single cell.
 *
 * BIND-01 states, applied to a gate file rather than a resolver:
 *   ANCHOR_BROKEN   — the file cannot load; it resolved its root to the wrong
 *                     place. It has never run. Not a product signal.
 *   RAN_RED         — the file loaded and executed cells; failures are real.
 *   RAN_GREEN       — the file loaded and its cells passed.
 * A static scan alone cannot separate the first from the second, so this
 * executes every candidate in both locations rather than reasoning about depth.
 *
 *   node scripts/gate-root-depth-audit.mjs            # scan + execute
 *   node scripts/gate-root-depth-audit.mjs --scan-only
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

import { captureProvenance } from './lib/run-provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const log = (m) => console.log(`[root-depth] ${m}`);

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.scratch', '_evidence', 'dist', 'dist-v9', 'build',
  'coverage', '.next', '.vite', 'venv', '__pycache__',
]);

/** The two mirrored module trees. A gate living in both is a mirrored pair. */
const MIRROR_TREES = [
  'chart v 1.4/chart/modules',
  'homepage/public/chart/modules',
];

/**
 * Executing a gate that launches Chrome would break host exclusivity, which is
 * now policy. These never run here regardless of what the scan finds.
 */
const BROWSER_MARKERS = [
  'puppeteer', 'playwright', 'heap-cycle-browser', 'harness-lib.mjs',
  'startServer', 'chrome-launcher', 'browser.newPage',
];

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

/** Repo root by content, the same test B's root-walk uses. */
function isRepoRoot(dir) {
  return fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'));
}

// Pure-dotdot literals only: `../..`, '../../..'. A literal naming a directory
// ('../modules') is a reference to a sibling, not an attempt to find the root,
// and counting it would inflate the answer.
const DOTDOT = String.raw`\.\.(?:[\\/]\.\.)*`;
const PATTERNS = [
  { kind: 'path.resolve(__dirname)', re: new RegExp(String.raw`path\.resolve\(\s*__dirname\s*,\s*['"](${DOTDOT})['"]`, 'g') },
  { kind: 'path.join(__dirname)', re: new RegExp(String.raw`path\.join\(\s*__dirname\s*,\s*['"](${DOTDOT})['"]`, 'g') },
  { kind: 'new URL(import.meta.url)', re: new RegExp(String.raw`new URL\(\s*['"](${DOTDOT})[\\/]?['"]\s*,\s*import\.meta\.url`, 'g') },
];

function scanFile(file) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const isGate = src.includes("'node:test'") || src.includes('"node:test"')
    || /\bGATE\b|\bORACLE\b/.test(src.slice(0, 2000));
  if (!isGate) return null;

  const anchors = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const literal = m[1];
      const resolved = path.resolve(path.dirname(file), literal);
      anchors.push({ kind, literal, resolved, resolvesToRepoRoot: isRepoRoot(resolved) });
    }
  }
  if (!anchors.length) return null;

  return {
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    anchors,
    usesRootWalk: /function findRoot|ANCHOR_BROKEN/.test(src),
    browserish: BROWSER_MARKERS.some((k) => src.includes(k)),
  };
}

function spawnNode(args, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT, env: { ...process.env, NO_COLOR: '1' },
    });
    let out = '';
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, killed, out });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, killed, out: `${out}\nSPAWN_ERROR ${err.message}` });
    });
  });
}

// The TAP reporter is requested explicitly. Node's default reporter prints
// `ℹ tests 2`, and an earlier version of this audit parsed `# tests 2` — so the
// count never matched, every file looked like zero cells, and any file whose
// output merely contained the word ENOENT was filed as never having run. A hand
// check caught it. An audit that mis-reads its own instrument is the thing the
// audit is about.
const runGate = (file, timeoutMs) => spawnNode(['--test', '--test-reporter=tap', file], timeoutMs);

/**
 * Does the file survive being imported at all? This is the only direct evidence
 * of a dead anchor: a gate whose ROOT is wrong throws at import, before any cell
 * is registered, and has therefore never run. Failing cells are a different
 * state entirely and are classified separately.
 */
async function loadProbe(file, timeoutMs = 30_000) {
  const url = pathToFileURL(file).href;
  const { out, killed } = await spawnNode([
    '-e',
    'import(process.argv[1]).then(()=>console.log("__LOAD_OK__")).catch((e)=>console.log("__LOAD_FAIL__ "+(e&&e.message||e)))',
    url,
  ], timeoutMs);
  if (killed) return { loaded: null, error: 'timeout during import' };
  if (out.includes('__LOAD_OK__')) return { loaded: true, error: null };
  const m = /__LOAD_FAIL__ ([^\n]*)/.exec(out);
  if (m) return { loaded: false, error: m[1].slice(0, 220) };
  // Neither sentinel. A standalone oracle that calls process.exit() on its way
  // through import kills the process before either line can print, so absence
  // of proof is not proof of failure — hand it back as unknown and let the run
  // decide. Reading it as a load failure is how an oracle that works ends up
  // counted among the dead.
  return { loaded: null, error: 'no sentinel (module exited during import)' };
}

/**
 * A load failure is not a red. Node reports an import-time throw as zero tests
 * having run, so the distinguishing evidence is the absence of executed cells,
 * corroborated by the error shape.
 */
function firstError(out) {
  const line = out.split(/\r?\n/).find((l) => /Error|ENOENT|Cannot find|ANCHOR_BROKEN/.test(l));
  return line ? line.trim().slice(0, 220) : null;
}

const ANCHOR_ERROR = /ENOENT|ERR_MODULE_NOT_FOUND|Cannot find module|ANCHOR_BROKEN|ERR_UNSUPPORTED_DIR_IMPORT/;

function classify({ code, killed, out }, load) {
  if (load && load.loaded === false) {
    return {
      state: 'NEVER_RAN',
      tests: 0,
      detail: ANCHOR_ERROR.test(load.error) ? 'dies at import on a path built from the anchor' : 'dies at import',
      evidence: load.error,
    };
  }
  if (killed) return { state: 'TIMEOUT', tests: null, detail: 'killed at timeout' };
  const passMatch = /^# pass (\d+)$/m.exec(out);
  const failMatch = /^# fail (\d+)$/m.exec(out);
  const testsMatch = /^# tests (\d+)$/m.exec(out);
  const tests = testsMatch ? Number(testsMatch[1]) : null;
  const pass = passMatch ? Number(passMatch[1]) : 0;
  const fail = failMatch ? Number(failMatch[1]) : 0;

  // Loaded, but a cell failed on a path the anchor built. Worse than a dead
  // file in one way: it does not read as absent, it reads as the product being
  // broken. A mirror-parity cell that cannot find the mirror reports drift.
  if (fail > 0 && ANCHOR_ERROR.test(out)) {
    return { state: 'ANCHOR_FAKE_RED', tests, pass, fail, detail: 'ran, but a cell failed on a path built from the anchor', evidence: firstError(out) };
  }
  if ((tests === 0 || tests === null) && code !== 0) {
    return { state: 'NO_CELLS_INCONCLUSIVE', tests: tests ?? 0, pass, fail, detail: 'zero cells, non-zero exit, no path error — inspect by hand', evidence: firstError(out) };
  }
  if (fail > 0 || code !== 0) return { state: 'RAN_RED', tests, pass, fail, detail: null, evidence: firstError(out) };
  return { state: 'RAN_GREEN', tests, pass, fail, detail: null };
}

/**
 * After the fix the rewritten files no longer match the scan, so they vanish
 * from the audit — which would read as the problem having gone away rather than
 * as evidence the fix worked. `--changed` runs exactly the files the codemod
 * touched, so before and after can be compared file by file.
 */
function changedFiles() {
  const raw = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return raw.split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.mjs'));
}

async function main() {
  const scanOnly = process.argv.includes('--scan-only');
  const changedOnly = process.argv.includes('--changed');
  const out = path.resolve(path.join(ROOT, 'docs/plan3/evidence', `root-depth-audit-${Date.now()}.json`));

  const files = walk(ROOT);
  const hits = changedOnly
    ? changedFiles().map((rel) => ({
      file: rel, anchors: [], usesRootWalk: true, browserish: false,
    }))
    : files.map(scanFile).filter(Boolean);
  log(`${files.length} .mjs files scanned, ${hits.length} gates anchor by fixed relative depth`);

  // Mirrored pairs: same basename present in both module trees. Only these can
  // have one copy silently dead while the other reports for both.
  const byBase = new Map();
  for (const h of hits) {
    const tree = MIRROR_TREES.find((t) => h.file.startsWith(`${t}/`));
    if (!tree) continue;
    const base = h.file.slice(tree.length + 1);
    if (!byBase.has(base)) byBase.set(base, {});
    byBase.get(base)[tree === MIRROR_TREES[0] ? 'canonical' : 'mirror'] = h;
  }
  const pairs = [...byBase.entries()].map(([base, sides]) => ({ base, ...sides }));
  const bothSides = pairs.filter((p) => p.canonical && p.mirror);
  log(`${pairs.length} of them sit in a mirrored tree; ${bothSides.length} exist in both locations`);

  const report = {
    signature: 'ROOT-DEPTH-AUDIT-V1',
    at: new Date().toISOString(),
    provenance: captureProvenance(),
    counts: {
      mjsScanned: files.length,
      gatesAnchoringByFixedDepth: hits.length,
      inMirroredTrees: pairs.length,
      presentInBothLocations: bothSides.length,
      onlyOneLocation: pairs.length - bothSides.length,
    },
    // Static suspicion, before execution: an anchor that does not land on the
    // repo root is either deliberate (a sibling directory) or the defect. Only
    // running it can tell, which is why this is not the headline number.
    staticallySuspect: hits.filter((h) => h.anchors.some((a) => !a.resolvesToRepoRoot))
      .map((h) => ({ file: h.file, anchors: h.anchors.map((a) => `${a.literal} -> ${path.relative(ROOT, a.resolved) || '<root>'}`) })),
    gates: hits,
    executed: [],
  };
  const save = () => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
  };
  save();
  log(`artifact: ${path.relative(ROOT, out)}`);

  if (scanOnly) return;

  const runnable = hits.filter((h) => !h.browserish);
  const skipped = hits.filter((h) => h.browserish);
  log(`executing ${runnable.length} gates (${skipped.length} skipped: they launch a browser and host exclusivity is policy)`);

  let done = 0;
  const queue = [...runnable];
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const h = queue.shift();
      if (!h) return;
      const full = path.join(ROOT, h.file);
      const load = await loadProbe(full);
      const verdict = classify(await runGate(full, 30_000), load);
      report.executed.push({ file: h.file, usesRootWalk: h.usesRootWalk, ...verdict });
      done += 1;
      if (verdict.state === 'NEVER_RAN' || verdict.state === 'ANCHOR_FAKE_RED') {
        log(`${verdict.state.padEnd(16)} ${h.file}`);
      }
      if (done % 10 === 0) { log(`${done}/${runnable.length}`); save(); }
    }
  });
  await Promise.all(workers);

  for (const h of skipped) report.executed.push({ file: h.file, state: 'NOT_EXECUTED_BROWSER', tests: null });

  const byState = {};
  for (const e of report.executed) byState[e.state] = (byState[e.state] || 0) + 1;
  report.counts.byState = byState;

  // The headline: a pair where one side never ran is a green total counting a
  // file that executed nothing.
  const stateOf = (file) => report.executed.find((e) => e.file === file)?.state ?? 'UNKNOWN';
  const broken = (s) => s === 'NEVER_RAN' || s === 'ANCHOR_FAKE_RED';
  report.deadMirrors = bothSides
    .map((p) => ({
      base: p.base,
      canonical: stateOf(p.canonical.file),
      mirror: stateOf(p.mirror.file),
    }))
    .filter((r) => broken(r.canonical) || broken(r.mirror));
  report.counts.pairsWithASideBrokenByItsAnchor = report.deadMirrors.length;
  report.counts.pairsWithASideThatNeverRan = report.deadMirrors
    .filter((r) => r.canonical === 'NEVER_RAN' || r.mirror === 'NEVER_RAN').length;
  save();

  log('');
  log(`gates anchoring by fixed relative depth: ${report.counts.gatesAnchoringByFixedDepth}`);
  log(`present in both mirror locations:        ${report.counts.presentInBothLocations}`);
  log(`pairs with a side broken by its anchor:  ${report.counts.pairsWithASideBrokenByItsAnchor}`);
  log(`  of those, a side that never ran:       ${report.counts.pairsWithASideThatNeverRan}`);
  for (const [state, n] of Object.entries(byState)) log(`  ${state}: ${n}`);
  log(`artifact: ${path.relative(ROOT, out)}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
