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
 *   node scripts/gate-root-depth-audit.mjs --scan-only          # read-only, any tree
 *   node scripts/gate-root-depth-audit.mjs --tree=<copy>       # executes; scratch only
 *   node scripts/gate-root-depth-audit.mjs --all-gates --tree=<copy>
 *
 * CENSUS-TREE-01, hard. Executing mode refuses to run against the working tree.
 * `--all-gates` executes mutation suites, and a mutation suite that is killed
 * mid-run leaves its mutant in the file. On 03-08 that left five product
 * mutations in the tree — the scalar clone at `chart.js:4191`, a negated
 * `_evictBehindPlayheadDisabled()` in both `replay-system.js` mirrors, a deleted
 * `_m20J1PumpThumbs()` call in both `order-manager.js` mirrors, and B-W18's
 * whole `parse_guard_enabled` rollback lever removed from `api_server.py` — and
 * rewrote sixteen evidence artifacts belonging to other lanes, one of which
 * flipped a recorded verdict from GREEN to RED. An instrument that rewrites the
 * evidence of the lanes it audits can turn a healthy product into a red record
 * with nobody watching, so this is a refusal in the instrument rather than a
 * note in a ledger.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

import { captureProvenance } from './lib/run-provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const log = (m) => console.log(`[root-depth] ${m}`);

/**
 * CENSUS-TREE-01 — where this run is allowed to scan and execute.
 *
 * Exported and pure so the refusal can be exercised without copying a tree.
 * The artifact still lands in the real repo; only the subject moves.
 *
 * @param {{argv: string[], root: string, exists?: (p: string) => boolean}} o
 */
export function resolveScanRoot({ argv, root, exists = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory() }) {
  const executes = !argv.includes('--scan-only');
  const flag = argv.find((a) => a.startsWith('--tree='));
  const raw = flag ? flag.slice('--tree='.length) : null;

  if (!executes) return { ok: true, state: 'READ_ONLY_SCAN', scanRoot: raw ? path.resolve(raw) : root, executes };

  if (!raw) {
    return {
      ok: false,
      executes,
      state: 'WORKING_TREE_EXECUTION_REFUSED',
      why: 'Executing mode runs gate and mutation suites, which write to the files they measure.'
        + ' Pass --tree=<scratch copy> to execute, or --scan-only to stay read-only.'
        + ' A killed mutation suite leaves its mutant behind, and on 03-08 that put five mutations into'
        + ' product source and rewrote sixteen of other lanes\' evidence artifacts.',
    };
  }

  const scanRoot = path.resolve(raw);
  // Inside the repo is not a scratch copy: git sees it, the audit walks it, and a
  // mutant left in it is a dirty working tree by another name.
  const rel = path.relative(root, scanRoot);
  if (scanRoot === root || (rel && !rel.startsWith('..') && !path.isAbsolute(rel))) {
    return {
      ok: false,
      executes,
      state: 'SCRATCH_TREE_IS_INSIDE_THE_WORKING_TREE',
      why: `--tree=${scanRoot} is the working tree or a directory inside it. Copy the checkout somewhere outside ${root}.`,
      scanRoot,
    };
  }
  if (!exists(scanRoot)) {
    return { ok: false, executes, state: 'SCRATCH_TREE_ABSENT', why: `--tree=${scanRoot} is not a directory that exists.`, scanRoot };
  }
  if (!exists(path.join(scanRoot, 'scripts'))) {
    return {
      ok: false,
      executes,
      state: 'SCRATCH_TREE_NOT_A_CHECKOUT',
      why: `--tree=${scanRoot} has no scripts/ directory, so it is not a copy of this checkout.`
        + ' Executing there would census an empty population and report it as a clean one.',
      scanRoot,
    };
  }
  return { ok: true, executes, state: 'SCRATCH_TREE', scanRoot };
}

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

/**
 * The directory variable is not always called `__dirname`.
 *
 * An earlier version of this scan matched that one name and undercounted: gates
 * writing `const HERE = path.dirname(fileURLToPath(import.meta.url))` and then
 * climbing from `HERE` were invisible to it, including a dead mirror it should
 * have caught. The name is a local choice; the act is the same.
 */
function dirVarsOf(src) {
  const names = new Set(['__dirname']);
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*path\.dirname\(\s*(?:fileURLToPath\(\s*import\.meta\.url\s*\)|__filename)\s*\)/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return [...names];
}

function patternsFor(src) {
  const out = [];
  for (const name of dirVarsOf(src)) {
    out.push(
      { kind: `path.resolve(${name})`, re: new RegExp(String.raw`path\.resolve\(\s*${name}\s*,\s*['"](${DOTDOT})['"]`, 'g') },
      { kind: `path.join(${name})`, re: new RegExp(String.raw`path\.join\(\s*${name}\s*,\s*['"](${DOTDOT})['"]`, 'g') },
    );
  }
  out.push({ kind: 'new URL(import.meta.url)', re: new RegExp(String.raw`new URL\(\s*['"](${DOTDOT})[\\/]?['"]\s*,\s*import\.meta\.url`, 'g') });
  return out;
}

/**
 * Is this file part of the population a sweep would count?
 *
 * The first version of this asked for a `node:test` import or a shouted GATE /
 * ORACLE in the header, and it missed `ckpt-ship-tag-first.test.mjs` — a
 * standalone oracle that imports node:assert, spells "gate" in lower case, and
 * had never parsed at all because of a byte-order mark ahead of its shebang. A
 * census that cannot see a file cannot report it as absent, which makes the hole
 * worse than the defect: it undercounts silently.
 *
 * So the name carries weight now. `.test.mjs` is a claim about the file made by
 * whoever named it, and it is a more reliable signal than its contents.
 */
export function isGateFile(file, src) {
  const base = path.basename(file);
  if (/\.(test|selftest|spec)\.mjs$/.test(base)) return true;
  if (/\.mutants\.mjs$/.test(base)) return true;
  if (/(^|[-.])(gate|oracle)([-.]|$)/i.test(base)) return true;
  if (src.includes("'node:test'") || src.includes('"node:test"')) return true;
  return /\bGATE\b|\bORACLE\b/i.test(src.slice(0, 2000));
}

function scanFile(file, { requireAnchor = true, root = ROOT } = {}) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return null; }
  if (!isGateFile(file, src)) return null;

  const anchors = [];
  for (const { kind, re } of patternsFor(src)) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const literal = m[1];
      const resolved = path.resolve(path.dirname(file), literal);
      anchors.push({ kind, literal, resolved, resolvesToRepoRoot: isRepoRoot(resolved) });
    }
  }
  if (!anchors.length && requireAnchor) return null;

  return {
    file: path.relative(root, file).replace(/\\/g, '/'),
    anchors,
    usesRootWalk: /function findRoot|ANCHOR_BROKEN/.test(src),
    browserish: BROWSER_MARKERS.some((k) => src.includes(k)),
  };
}

/**
 * The tree gates are executed in. Set once by main() from CENSUS-TREE-01 and
 * never ROOT in an executing run — a gate that resolves anything from cwd would
 * otherwise write into the working tree from a scratch-copy census.
 */
let SUBJECT_TREE = ROOT;

function spawnNode(args, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: SUBJECT_TREE, env: { ...process.env, NO_COLOR: '1' },
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

/**
 * A `.red` oracle that reports its verdict by throwing at import is doing its
 * job, and it looks identical to a file that died on a bad path. Separating them
 * is a heuristic and is labelled as one: a path error is a path error, and
 * anything else thrown by a file named `.red.` is taken as a declared verdict.
 *
 * Getting this wrong in the safe direction matters more than getting it right:
 * calling a working red oracle "never ran" inflates the vacuity count, and an
 * inflated count spends someone's night.
 */
export function looksLikeDeclaredRed(file, error) {
  if (!error || ANCHOR_ERROR.test(error)) return false;
  if (/\.red\.|\.red\b/i.test(path.basename(file))) return true;
  return /\bRED\b|GATE-\d|must not|must fail/i.test(error);
}

function classify({ code, killed, out }, load, file = '') {
  if (load && load.loaded === false) {
    if (looksLikeDeclaredRed(file, load.error)) {
      return {
        state: 'RED_DECLARED_AT_IMPORT',
        tests: 0,
        detail: 'throws its verdict at import; a red oracle, not a dead file (heuristic)',
        evidence: load.error,
      };
    }
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

  // Exited clean having asserted nothing. This is the same vacuity as a gate
  // that dies at import, wearing the opposite costume: it does not merely fail
  // to prove anything, it is *counted* as proof. Any sweep that reads exit codes
  // scores it green, which is how two panel-state gates that parse nothing sat
  // in the green total.
  if (tests === 0) {
    return { state: 'ZERO_CELLS_SCORED_GREEN', tests: 0, pass, fail, detail: 'loaded, exited 0, registered no cells' };
  }
  if (tests === null) {
    return { state: 'NO_TAP_COUNTERS', tests: null, pass, fail, detail: 'exited 0 but printed no TAP counters; not a node:test gate' };
  }
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
  // The anchor-shaped question was answered and fixed this morning, which means
  // the anchor scan can no longer see the files it repaired — they stopped
  // matching. `--all-gates` asks the question the seal actually needs: of every
  // gate in the tree, how many never execute, for any cause at all. A gate that
  // never ran is absent while scoring as present, and the cause of its absence
  // is a detail.
  const allGates = process.argv.includes('--all-gates');

  // CENSUS-TREE-01, before anything is walked: executing mode needs a scratch
  // copy. The refusal is here rather than in a ledger because the last run of
  // this instrument mutated product source and other lanes' evidence, and a rule
  // that depends on the operator remembering it is the same class of mechanism
  // that has failed five times on this box.
  const treeGate = resolveScanRoot({ argv: process.argv, root: ROOT });
  if (!treeGate.ok) {
    log(`REFUSED — ${treeGate.state}`);
    log(`  ${treeGate.why}`);
    log(`  scratch copy: robocopy "${ROOT}" "<somewhere outside the repo>" /E /XD node_modules .git`);
    process.exitCode = 1;
    return;
  }
  const SCAN_ROOT = treeGate.scanRoot;
  SUBJECT_TREE = SCAN_ROOT;
  log(`subject tree: ${treeGate.state} ${SCAN_ROOT}${treeGate.executes ? ' (executing)' : ' (read-only)'}`);

  const tag = allGates ? 'all-gates' : 'root-depth';
  const out = path.resolve(path.join(ROOT, 'docs/plan3/evidence', `${tag}-audit-${Date.now()}.json`));

  const files = walk(SCAN_ROOT);
  let hits;
  if (changedOnly) {
    // The change list comes from the real repo, read-only; the files are then run
    // wherever the subject tree is.
    hits = changedFiles().map((rel) => ({ file: rel, anchors: [], usesRootWalk: true, browserish: false }));
  } else if (allGates) {
    hits = files.map((f) => scanFile(f, { requireAnchor: false, root: SCAN_ROOT })).filter(Boolean);
  } else {
    hits = files.map((f) => scanFile(f, { root: SCAN_ROOT })).filter(Boolean);
  }
  log(`${files.length} .mjs files scanned, ${hits.length} ${allGates ? 'gate files found' : 'gates anchor by fixed relative depth'}`);

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
    signature: allGates ? 'GATE-EXECUTION-CENSUS-V1' : 'ROOT-DEPTH-AUDIT-V1',
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
      .map((h) => ({ file: h.file, anchors: h.anchors.map((a) => `${a.literal} -> ${path.relative(SCAN_ROOT, a.resolved) || '<root>'}`) })),
    // Which tree the population came from. A census of a scratch copy is not a
    // census of HEAD unless the copy is stated, and the artifact is the only place
    // a later reader can find that out.
    subject: { state: treeGate.state, tree: SCAN_ROOT, executed: treeGate.executes, isWorkingTree: SCAN_ROOT === ROOT },
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
  const workers = Array.from({ length: allGates ? 6 : 4 }, async () => {
    for (;;) {
      const h = queue.shift();
      if (!h) return;
      const full = path.join(SCAN_ROOT, h.file);
      // Parse before executing. A file that does not parse has never run in any
      // location, and it is the cheapest thing to check and the easiest to miss:
      // tonight's two were a declaration inserted inside an import block and a
      // byte-order mark ahead of a shebang, both invisible to inspection.
      const parsed = await spawnNode(['--check', full], 20_000);
      if (parsed.code !== 0) {
        report.executed.push({
          file: h.file,
          usesRootWalk: h.usesRootWalk,
          state: 'PARSE_FAILED',
          tests: 0,
          detail: 'does not parse; has never run anywhere',
          evidence: firstError(parsed.out) || (parsed.out || '').split(/\r?\n/).slice(0, 3).join(' ').slice(0, 220),
        });
        done += 1;
        log(`PARSE_FAILED           ${h.file}`);
        continue;
      }
      const load = await loadProbe(full);
      const verdict = classify(await runGate(full, 30_000), load, h.file);
      report.executed.push({ file: h.file, usesRootWalk: h.usesRootWalk, ...verdict });
      done += 1;
      if (verdict.state === 'NEVER_RAN' || verdict.state === 'ANCHOR_FAKE_RED' || verdict.state === 'ZERO_CELLS_SCORED_GREEN') {
        log(`${verdict.state.padEnd(22)} ${h.file}`);
      }
      if (done % 25 === 0) { log(`${done}/${runnable.length}`); save(); }
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

  // Named, not just counted. A count invites the reader to assume someone has
  // the list.
  const ABSENT = new Set(['NEVER_RAN', 'PARSE_FAILED', 'ZERO_CELLS_SCORED_GREEN']);
  report.neverRan = report.executed.filter((e) => ABSENT.has(e.state))
    .map((e) => ({ file: e.file, state: e.state, evidence: e.evidence }));
  report.zeroCells = report.executed.filter((e) => e.state === 'ZERO_CELLS_SCORED_GREEN')
    .map((e) => e.file);
  report.counts.absentButScoringAsPresent = report.neverRan.length;
  save();

  log('');
  log(allGates
    ? `gate files found:                        ${report.counts.gatesAnchoringByFixedDepth}`
    : `gates anchoring by fixed relative depth: ${report.counts.gatesAnchoringByFixedDepth}`);
  log(`present in both mirror locations:        ${report.counts.presentInBothLocations}`);
  log(`absent but scoring as present:           ${report.counts.absentButScoringAsPresent}`);
  log(`pairs with a side broken by its anchor:  ${report.counts.pairsWithASideBrokenByItsAnchor}`);
  log(`  of those, a side that never ran:       ${report.counts.pairsWithASideThatNeverRan}`);
  for (const [state, n] of Object.entries(byState)) log(`  ${state}: ${n}`);
  log(`artifact: ${path.relative(ROOT, out)}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
