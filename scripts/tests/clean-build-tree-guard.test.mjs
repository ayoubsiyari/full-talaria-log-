/**
 * CLEAN-TREE-01 gate.
 *
 * The guard has to do three things and each is separately falsifiable: refuse
 * when uncommitted source could reach the bundle, NOT refuse on the board and
 * gate churn that fills this tree, and write nothing when it refuses.
 *
 * The refusal cells are paired with a clean arm that runs the SAME sandbox
 * build with the one variable flipped: the offending file committed. If that
 * build writes and the dirty one refuses, the refusal is caused by the guard
 * rather than by the sandbox being broken — a gate whose red survives removing
 * the thing under test is measuring its own harness.
 *
 * That arm used to work by standing the guard down through a waiver. The waiver
 * is gone by ruling (a bypass in the same tooling makes the gate advisory), so
 * the discriminator is now committed-vs-dirty, which is both a truer A/B and
 * one that cannot be reached for at 3am.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BUILD_INPUT_ROOTS,
  DirtyTreeRefusal,
  assertCleanBuildInputs,
  isBuildInput,
  offendingEntries,
  parsePorcelainZ,
} from '../clean-build-tree-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

/** `assert.throws` does not hand back the error, and we need its fields. */
function capture(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

const z = (...entries) => `${entries.join('\0')}\0`;

test('CLEANTREE: the incident that caused this guard is refused', () => {
  // c0c013b9c compiled panelStateStorage.js off the shared disk while it was
  // uncommitted. Same shape, replayed.
  const raw = z('?? chart v 1.4/talaria-design/src/panelStateStorage.js');
  const err = capture(() => assertCleanBuildInputs({ raw, env: {} }));
  assert.ok(err instanceof DirtyTreeRefusal, 'expected a refusal');
  assert.equal(err.reason, 'DIRTY_BUILD_INPUTS');
  assert.deepEqual(err.paths, ['chart v 1.4/talaria-design/src/panelStateStorage.js']);
  assert.match(err.message, /Nothing was written/);
  assert.match(err.message, /panelStateStorage\.js/);
});

test('CLEANTREE: a clean tree passes', () => {
  const res = assertCleanBuildInputs({ raw: '', env: {} });
  assert.equal(res.clean, true);
  assert.deepEqual(res.offenders, []);
});

test('CLEANTREE: board, doc and gate churn does not block a build', () => {
  // A gate that fires on work it does not govern gets routed around, and then
  // it protects nothing. These are the file classes that fill this tree.
  const raw = z(
    ' M docs/plan3/board/BOARD-B.md',
    ' M docs/plan3/TAL-01865-RESTORE-MANIFEST-20260802.md',
    '?? chart v 1.4/chart/modules/panel-state-binding.test.mjs',
    '?? chart v 1.4/chart/modules/b-fixtures/m15-pin-lifecycle-matrix.json',
    ' D homepage/public/chart/multichart-prod/harness/gate-t8.log',
    ' M package.json',
  );
  const res = assertCleanBuildInputs({ raw, env: {} });
  assert.equal(res.clean, true, 'non-shipping churn must not refuse');
});

test('CLEANTREE: build outputs do not count as inputs', () => {
  // dist-v9 is what the build writes; its state beforehand proves nothing, and
  // counting it would make every second build refuse on its own output.
  const raw = z(
    ' M chart v 1.4/chart/dist-v9/assets/talaria-v9-live.js',
    ' M chart v 1.4/talaria-design/node_modules/x/index.js',
  );
  assert.equal(assertCleanBuildInputs({ raw, env: {} }).clean, true);
});

test('CLEANTREE: every governed root is actually governed', () => {
  // Anti-vacuity: the roots list must not silently shrink to nothing.
  assert.ok(BUILD_INPUT_ROOTS.length >= 3);
  for (const root of BUILD_INPUT_ROOTS) {
    assert.equal(isBuildInput(`${root}some-file.js`), true, `${root} is declared but not governed`);
  }
});

test('CLEANTREE: engine source and its served mirror both count', () => {
  assert.equal(isBuildInput('chart v 1.4/chart/modules/replay-system.js'), true);
  assert.equal(isBuildInput('chart v 1.4/chart/chart.js'), true);
  assert.equal(isBuildInput('chart v 1.4/talaria-design/src/MultichartGrid.jsx'), true);
  assert.equal(isBuildInput('docs/plan3/board/BOARD-C.md'), false);
  assert.equal(isBuildInput('scripts/rebuild-constraint-check.mjs'), false);
});

test('CLEANTREE: -z parsing survives the spaces in "chart v 1.4"', () => {
  // The non -z form quotes and escapes these paths; parsing that back is its
  // own source of wrong answers, so the guard must be reading NUL records.
  const entries = parsePorcelainZ(z(
    ' M chart v 1.4/chart/chart.js',
    '?? chart v 1.4/talaria-design/src/new file.jsx',
  ));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].path, 'chart v 1.4/chart/chart.js');
  assert.equal(entries[1].path, 'chart v 1.4/talaria-design/src/new file.jsx');
  assert.ok(entries.every((e) => !e.path.includes('"')), 'paths must not arrive quoted');
});

test('CLEANTREE: a rename is caught by either side', () => {
  const moved = parsePorcelainZ(z(
    'R  docs/plan3/note.md',
    'chart v 1.4/talaria-design/src/oldName.js',
  ));
  assert.equal(moved.length, 1);
  assert.equal(moved[0].from, 'chart v 1.4/talaria-design/src/oldName.js');
  assert.equal(offendingEntries(moved).length, 1, 'source of a rename out of a governed root must count');
});

test('CLEANTREE: there is no waiver — the refusal cannot be bought off with an env var', () => {
  // Ruled out deliberately: provenance is a seal gate, and a bypass shipped in
  // the same tooling is what turns a gate into advice. This cell exists so the
  // waiver cannot come back quietly, and it fails loudly if anyone re-adds one.
  const raw = z(' M chart v 1.4/talaria-design/src/panelStateStorage.js');
  const attempts = [
    { TALARIA_ALLOW_DIRTY_BUILD: '1' },
    { TALARIA_ALLOW_DIRTY_BUILD: 'PO waived: D mid-commit on the money path' },
    { TALARIA_ALLOW_DIRTY_BUILD: 'true', FORCE: '1', CI: '1' },
  ];
  for (const env of attempts) {
    const err = capture(() => assertCleanBuildInputs({ raw, env }));
    assert.ok(
      err instanceof DirtyTreeRefusal,
      `a dirty tree was allowed through with env ${JSON.stringify(env)}`,
    );
    assert.equal(err.reason, 'DIRTY_BUILD_INPUTS');
  }

  // And the escape hatch is not merely inert, it is absent from the source.
  const src = fs.readFileSync(path.join(REPO, 'scripts/clean-build-tree-guard.mjs'), 'utf8');
  const live = src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');
  assert.doesNotMatch(live, /TALARIA_ALLOW_DIRTY_BUILD/, 'the waiver env var is still read');
});

test('BINDING: build:chart-v9 reaches the guard before anything that writes', () => {
  // Present is not bound. The guard could be perfect and never run.
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const build = pkg.scripts['build:chart-v9'];
  assert.ok(build, 'RESOLVER_ABSENT_FROM_TREE: build:chart-v9 is gone');
  assert.match(build, /preflight:clean-build-tree/, 'the build no longer runs the guard');
  assert.ok(
    build.indexOf('preflight:clean-build-tree') < build.indexOf('build:live'),
    'the guard must run before the step that writes',
  );
  assert.match(pkg.scripts['preflight:clean-build-tree'], /clean-build-tree-guard\.mjs/);
});

test('BINDING: the first writer refuses on its own, not only via the npm chain', () => {
  // build:live can be invoked directly from the design package, bypassing the
  // root script entirely. The guard has to live in the writer for that path.
  const src = fs.readFileSync(
    path.join(REPO, 'chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs'),
    'utf8',
  );
  assert.match(src, /assertCleanBuildInputs/, 'the writer does not call the guard');
  const call = src.indexOf('assertCleanBuildInputs(');
  const firstWrite = src.indexOf('fs.writeFileSync');
  const mainAt = src.indexOf('function main()');
  assert.ok(call > mainAt, 'the guard must be called from main()');
  assert.ok(
    call < src.indexOf('bumpChartScriptsInHtml(', mainAt),
    'the guard must run before the first stamping call in main()',
  );
  assert.ok(firstWrite > 0, 'sanity: this script does write files');
  assert.match(src, /DirtyTreeRefusal/, 'the refusal must be mapped to exit 2, not rethrown as a crash');
});

test('CLEANTREE: no git working tree is unverifiable, not clean', (t) => {
  // Docker and CI build from source copied out of a commit: there is no working
  // tree that could carry another lane's edits. Refusing there would break every
  // production build to defend against something structurally impossible.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'cleantree-nogit-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));

  const res = assertCleanBuildInputs({ cwd: bare, env: {} });
  assert.equal(res.clean, true, 'a build with no working tree must proceed');
  assert.equal(res.unverifiable, true, 'and it must say it could not verify, not claim it checked');
});

test('CLEANTREE: the no-git escape does not mask a real dirty tree', () => {
  // The dangerous version of the above is a guard that returns "unverifiable"
  // whenever anything goes wrong, which is a bypass wearing a warning label.
  // With a real repo present the same call must still refuse.
  const raw = z(' M chart v 1.4/talaria-design/src/panelStateStorage.js');
  const err = capture(() => assertCleanBuildInputs({ cwd: REPO, raw, env: {} }));
  assert.ok(err instanceof DirtyTreeRefusal, 'a readable tree must be judged, not excused');
  assert.equal(err.reason, 'DIRTY_BUILD_INPUTS');
});

/* ---------------------------------------------------------------------------
 * The end-to-end arm: does the real first writer actually write nothing?
 * ------------------------------------------------------------------------ */

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleantree-'));
  const design = path.join(root, 'chart v 1.4', 'talaria-design');
  fs.mkdirSync(path.join(design, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(design, 'live', 'public'), { recursive: true });
  fs.mkdirSync(path.join(design, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'chart v 1.4', 'chart', 'dist-v9'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });

  fs.copyFileSync(
    path.join(REPO, 'scripts', 'clean-build-tree-guard.mjs'),
    path.join(root, 'scripts', 'clean-build-tree-guard.mjs'),
  );
  fs.copyFileSync(
    path.join(REPO, 'chart v 1.4', 'talaria-design', 'scripts', 'bump-dist-v9-cache.mjs'),
    path.join(design, 'scripts', 'bump-dist-v9-cache.mjs'),
  );

  const html = '<script defer src="/chart/chart.js?v=20260101a1"></script>\n';
  fs.writeFileSync(path.join(design, 'live', 'index.html'), html);
  fs.writeFileSync(path.join(root, 'chart v 1.4', 'chart', 'dist-v9', 'index.html'), html);
  fs.writeFileSync(path.join(design, 'src', 'someSource.js'), 'export const a = 1;\n');

  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'gate@talaria.test');
  git('config', 'user.name', 'CLEANTREE gate');
  git('add', '-A');
  git('commit', '-qm', 'sandbox baseline');
  return { root, design };
}

function runBump(root, design, env) {
  return spawnSync(process.execPath, [path.join(design, 'scripts', 'bump-dist-v9-cache.mjs'), '--live'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, BUILD_ID: '20260802zzz9', ...env },
  });
}

test('CLEANTREE: the real first writer refuses with exit 2 and writes nothing', (t) => {
  const { root, design } = makeSandbox();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const liveIndex = path.join(design, 'live', 'index.html');
  const before = fs.readFileSync(liveIndex, 'utf8');

  // Dirty a governed input, exactly as another lane mid-edit would.
  fs.writeFileSync(path.join(design, 'src', 'someSource.js'), 'export const a = 2;\n');

  const res = runBump(root, design, {});
  assert.equal(res.status, 2, `expected exit 2, got ${res.status}\n${res.stderr}`);
  assert.match(res.stderr, /REFUSING TO BUILD/);
  assert.match(res.stderr, /someSource\.js/, 'the offending path must be named');
  assert.equal(fs.readFileSync(liveIndex, 'utf8'), before, 'the stamp was written despite the refusal');
  assert.match(before, /20260101a1/, 'sanity: the sandbox stamp is the original');
});

test('CLEANTREE: commit that same edit and the same build writes — the refusal is load-bearing', (t) => {
  const { root, design } = makeSandbox();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const liveIndex = path.join(design, 'live', 'index.html');
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });

  // Byte-for-byte the edit that was refused in the cell above. The ONLY
  // variable between the two runs is whether it is committed, so a write here
  // proves the refusal there came from the guard and not from a broken sandbox.
  fs.writeFileSync(path.join(design, 'src', 'someSource.js'), 'export const a = 2;\n');
  git('add', '-A');
  git('commit', '-qm', 'the same edit, committed');

  const res = runBump(root, design, {});
  assert.equal(res.status, 0, `expected the clean build to proceed, got ${res.status}\n${res.stderr}`);
  assert.match(
    fs.readFileSync(liveIndex, 'utf8'),
    /20260802zzz9/,
    'the clean build should have stamped',
  );
});

test('CLEANTREE: a committed sandbox builds without a waiver', (t) => {
  const { root, design } = makeSandbox();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  // Nothing dirty in a governed root: the guard must be silent, not merely rare.
  const res = runBump(root, design, {});
  assert.equal(res.status, 0, `a clean tree must build: ${res.stderr}`);
  assert.match(fs.readFileSync(path.join(design, 'live', 'index.html'), 'utf8'), /20260802zzz9/);
});

test('CLEANTREE: BUILD-ID-01 still refuses first, and the twin did not break it', (t) => {
  const { root, design } = makeSandbox();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const res = spawnSync(process.execPath, [path.join(design, 'scripts', 'bump-dist-v9-cache.mjs'), '--live'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, BUILD_ID: '' },
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /no explicit build id/i);
});
