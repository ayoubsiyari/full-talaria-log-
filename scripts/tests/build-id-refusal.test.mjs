/**
 * BUILD-ID-01 — the cache stamp must be supplied, never invented.
 *
 * `bump-dist-v9-cache.mjs` used to resolve a missing build id by incrementing
 * the stamp committed in `talaria-design/live/index.html`. That stamp trails
 * what production has served, so an ordinary local `npm run build:chart-v9`
 * wrote `20260728b88` across `chart.js` (both mirrors), every `sw.js`,
 * `index.html`, `chart-embed.html` and the harness `serve.mjs` — over a
 * deployed b122 — and exited 0 looking like a successful build. The same shape
 * was recorded once before as b61→b62 against a live b80.
 *
 * The fix is a refusal, so this gate is mostly about proving the refusal is
 * what stops it (MUTANT), that it stops it *before writing* (END-TO-END), and
 * that it has not become a refusal of everything (ANTI-VACUITY).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: RUNTIME_TOOL — the real script under test is spawned and its exit code read. Green is evidence about the tool, NOT about served bytes.');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const SCRIPT = path.resolve(
  repoRoot,
  'chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs',
);
const SYNC = path.resolve(
  repoRoot,
  'chart v 1.4/talaria-design/scripts/sync-v9-to-homepage.mjs',
);
const LIVE_INDEX = path.resolve(repoRoot, 'chart v 1.4/talaria-design/live/index.html');

/**
 * Stage the script at its real depth inside a sandbox, with the sibling modules
 * it imports. A flat copy resolves `../../../scripts/...` outside the sandbox
 * and the test then reports a module-not-found where it means to report a
 * refusal — the harness failing in the costume of the thing under test.
 */
function stageScript(sandbox, write) {
  const scriptDir = path.join(sandbox, 'repo', 'talaria-design', 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });
  fs.copyFileSync(
    path.resolve(repoRoot, 'scripts/clean-build-tree-guard.mjs'),
    path.join(sandbox, 'scripts', 'clean-build-tree-guard.mjs'),
  );
  const dest = path.join(scriptDir, 'bump-dist-v9-cache.mjs');
  write(dest);
  return dest;
}

/** BIND-01: absence of the file is a different state from a broken anchor inside it. */
function readScript() {
  if (!fs.existsSync(SCRIPT)) {
    assert.fail(`RESOLVER_ABSENT_FROM_TREE: ${SCRIPT} does not exist`);
  }
  return fs.readFileSync(SCRIPT, 'utf8');
}

/** Slice a top-level `function name(` … `}` block by brace matching. */
function sliceFunction(source, header) {
  const start = source.indexOf(header);
  if (start < 0) return null;
  // Skip the parameter list: destructured params carry braces of their own.
  let paren = source.indexOf('(', start);
  if (paren < 0) return null;
  let parenDepth = 0;
  let afterParams = -1;
  for (let i = paren; i < source.length; i += 1) {
    if (source[i] === '(') parenDepth += 1;
    else if (source[i] === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        afterParams = i + 1;
        break;
      }
    }
  }
  if (afterParams < 0) return null;
  const open = source.indexOf('{', afterParams);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1, body: source.slice(start, i + 1) };
    }
  }
  return null;
}

const mod = await import(pathToFileURL(SCRIPT).href);

/** assert.throws does not hand back the error, and the `reason` is the point here. */
function captureRefusal(fn) {
  try {
    const value = fn();
    assert.fail(`expected a refusal, got ${JSON.stringify(value)}`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    assert.ok(error instanceof mod.BuildIdRefusal, `expected BuildIdRefusal, got ${error}`);
    return error;
  }
}

test('PRESENCE: the script exports a build-id resolver', () => {
  assert.equal(
    typeof mod.resolveBuildId,
    'function',
    'RESOLVER_ABSENT_FROM_TREE: bump-dist-v9-cache.mjs exports no resolveBuildId',
  );
  assert.equal(typeof mod.BuildIdRefusal, 'function', 'RESOLVER_ABSENT_FROM_TREE: no BuildIdRefusal');
});

test('refuses when BUILD_ID is absent', () => {
  const err = captureRefusal(() => mod.resolveBuildId({}));
  assert.equal(err.reason, 'BUILD_ID_ABSENT');
  assert.match(err.message, /REFUSING TO STAMP/);
  assert.match(err.message, /Nothing was written/);
});

test('refuses when BUILD_ID is present but empty — the ordinary docker build shape', () => {
  // homepage/Dockerfile: ARG CHART_BUILD_ID= / ENV BUILD_ID=${CHART_BUILD_ID}.
  // An unset arg arrives as an empty string, which is a different operator
  // mistake from never setting it, and the message has to say which.
  const err = captureRefusal(() => mod.resolveBuildId({ BUILD_ID: '' }));
  assert.equal(err.reason, 'BUILD_ID_EMPTY');
  assert.match(err.message, /set but empty/);
});

test('refuses whitespace-only BUILD_ID', () => {
  const err = captureRefusal(() => mod.resolveBuildId({ BUILD_ID: '   ' }));
  assert.equal(err.reason, 'BUILD_ID_EMPTY');
});

test('ANTI-VACUITY: an explicit BUILD_ID is accepted verbatim', () => {
  assert.deepEqual(mod.resolveBuildId({ BUILD_ID: '20260802b123' }), {
    id: '20260802b123',
    source: 'BUILD_ID',
  });
  assert.deepEqual(mod.resolveBuildId({ BUILD_ID: '  20260802b123  ' }), {
    id: '20260802b123',
    source: 'BUILD_ID',
  });
});

test('ANTI-VACUITY: CI keeps building — GITHUB_SHA is a real identity, not a guess', () => {
  // .github/workflows/multichart-harness.yml runs `npm run build:live` with no
  // BUILD_ID. Actions always sets GITHUB_SHA, so the guard must not break it.
  assert.deepEqual(mod.resolveBuildId({ GITHUB_SHA: 'abcdef0123456789' }), {
    id: 'abcdef0123',
    source: 'GITHUB_SHA',
  });
});

test('an explicit BUILD_ID outranks GITHUB_SHA', () => {
  assert.deepEqual(
    mod.resolveBuildId({ BUILD_ID: '20260802b123', GITHUB_SHA: 'abcdef0123456789' }),
    { id: '20260802b123', source: 'BUILD_ID' },
  );
});

test('the invention paths are gone from the tree, not merely unreachable', () => {
  const source = readScript();
  assert.equal(
    /function\s+incrementBuildId/.test(source),
    false,
    'incrementBuildId still present — dormant invention invites rewiring',
  );
  assert.equal(/function\s+defaultBuildId/.test(source), false, 'defaultBuildId still present');
});

test('BINDING: main() resolves the id before it writes anything', () => {
  const source = readScript();
  const main = sliceFunction(source, 'function main(');
  assert.ok(main, 'ANCHOR_BROKEN: could not slice main() from bump-dist-v9-cache.mjs');
  const resolveAt = main.body.indexOf('resolveBuildId(');
  assert.ok(resolveAt >= 0, 'ANCHOR_BROKEN: main() never calls resolveBuildId');
  const firstWriteAt = Math.min(
    ...['bumpChartScriptsInHtml(', 'bumpServiceWorkerVersion(', 'bumpChartEngine(']
      .map((needle) => main.body.indexOf(needle))
      .filter((at) => at >= 0),
  );
  assert.ok(Number.isFinite(firstWriteAt), 'ANCHOR_BROKEN: main() has no write calls to order against');
  assert.ok(
    resolveAt < firstWriteAt,
    'a half-stamped tree is worse than an unstamped one: resolve must precede the first write',
  );
});

test('BINDING: the stamping helper will not invent an id if main stops passing one', () => {
  const source = readScript();
  const helper = sliceFunction(source, 'function bumpChartScriptsInHtml(');
  assert.ok(helper, 'ANCHOR_BROKEN: could not slice bumpChartScriptsInHtml()');
  assert.equal(
    /\?\?\s*resolveBuildId\(|\|\|\s*resolveBuildId\(/.test(helper.body),
    false,
    'helper re-derives an id when the caller omits one',
  );
  assert.match(helper.body, /BuildIdRefusal/, 'helper does not refuse a missing id');
});

test('BINDING: build:chart-v9 reaches this script', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8'));
  const designPkg = JSON.parse(
    fs.readFileSync(path.resolve(repoRoot, 'chart v 1.4/talaria-design/package.json'), 'utf8'),
  );
  const entry = rootPkg.scripts?.['build:chart-v9'];
  assert.ok(entry, 'RESOLVER_ABSENT_FROM_TREE: no build:chart-v9 script');
  assert.match(entry, /build:live/, 'ANCHOR_BROKEN: build:chart-v9 no longer delegates to build:live');
  // Both the human entry point and the one the image build runs.
  for (const name of ['build:live', 'build:live:chart']) {
    assert.match(
      designPkg.scripts?.[name] || '',
      /bump-dist-v9-cache\.mjs/,
      `${name} does not route through the guarded script`,
    );
  }
});

test('BINDING: the sync step propagates a refusal instead of warning past it', () => {
  const source = fs.readFileSync(SYNC, 'utf8');
  const at = source.indexOf('bump-dist-v9-cache --dist exited');
  assert.ok(at >= 0, 'ANCHOR_BROKEN: sync no longer reports the bump exit status');
  const tail = source.slice(at, at + 400);
  assert.match(tail, /process\.exit\(/, 'sync swallows a failed bump and continues');
});

test('END-TO-END: a refused run leaves every stamp target byte-identical', () => {
  const targets = [
    'chart v 1.4/talaria-design/live/index.html',
    'chart v 1.4/chart/dist-v9/index.html',
    'homepage/public/chart/dist-v9/index.html',
    'chart v 1.4/chart/chart.js',
    'homepage/public/chart/chart.js',
    'chart v 1.4/chart/sw.js',
    'homepage/public/chart/sw.js',
    'chart v 1.4/chart/index.html',
    'chart v 1.4/chart/multichart-prod/chart-embed.html',
    'homepage/public/chart/multichart-prod/chart-embed.html',
    'chart v 1.4/chart/multichart-prod/harness/serve.mjs',
  ]
    .map((rel) => path.resolve(repoRoot, rel))
    .filter((abs) => fs.existsSync(abs));
  assert.ok(targets.length >= 6, `ANCHOR_BROKEN: only ${targets.length} stamp targets found`);

  const digest = () =>
    targets.map((abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'));
  const before = digest();

  const env = { ...process.env };
  delete env.BUILD_ID;
  delete env.GITHUB_SHA;
  const run = spawnSync(process.execPath, [SCRIPT, '--dist'], { env, encoding: 'utf8' });

  assert.equal(run.status, 2, `expected refusal exit 2, got ${run.status}: ${run.stderr}`);
  assert.match(run.stderr, /REFUSING TO STAMP/);
  assert.deepEqual(digest(), before, 'the refused run modified files');
});

test('exit 2 is a refusal and stays distinct from an ordinary failure', () => {
  // Same disease as the passport verifier: a gate that crashes and a gate that
  // blocks must not both exit 1, or the operator is sent after damage that does
  // not exist. A missing stamp target is an ordinary failure and stays at 1.
  //
  // Run from a copy nested inside a temp dir so every path the script resolves
  // (`../../chart`, `../../../homepage`) lands in the sandbox. Handing a real
  // build id to the real script would stamp the working tree.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'build-id-exit-'));
  const copy = stageScript(sandbox, (dest) => fs.copyFileSync(SCRIPT, dest));

  const run = spawnSync(process.execPath, [copy, '--dist'], {
    env: { ...process.env, BUILD_ID: '20260802b999' },
    encoding: 'utf8',
  });
  assert.equal(run.status, 1, `missing target should exit 1, got ${run.status}`);
  assert.match(run.stderr + run.stdout, /Missing/);
  assert.notEqual(run.status, 2, 'exit 2 must mean "no build id", nothing else');
});

test('MUTANT: restoring the derive-from-committed-stamp fallback removes the refusal', () => {
  const source = readScript();
  const fn = sliceFunction(source, 'export function resolveBuildId(');
  assert.ok(fn, 'ANCHOR_BROKEN: could not slice resolveBuildId()');

  // Derive from a fixture rather than the live tree: another lane's build can
  // restamp live/index.html mid-run, and a mutant whose verdict depends on tree
  // state proves nothing on the night it matters.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'build-id-mutant-'));
  const fixture = path.join(sandbox, 'stale-live-index.html');
  fs.writeFileSync(
    fixture,
    '<script defer src="/chart/chart.js?v=20260728b85"></script>\n',
    'utf8',
  );

  const preFix = `export function resolveBuildId(env = process.env) {
  const explicit = env.BUILD_ID?.trim();
  if (explicit) return { id: explicit, source: "BUILD_ID" };
  const sha = env.GITHUB_SHA?.trim();
  if (sha) return { id: sha.slice(0, 10), source: "GITHUB_SHA" };
  const current = readCurrentChartBuildId(fs.readFileSync(${JSON.stringify(fixture)}, "utf8"));
  if (current) {
    const m = /^(\\d{8})([ab])(\\d+)$/i.exec(String(current).trim());
    if (m) return { id: m[1] + m[2] + (parseInt(m[3], 10) + 1), source: "DERIVED" };
  }
  return { id: "20260802b1", source: "DEFAULT" };
}`;

  const mutantPath = stageScript(sandbox, (dest) => {
    fs.writeFileSync(dest, source.slice(0, fn.start) + preFix + source.slice(fn.end), 'utf8');
  });

  return import(pathToFileURL(mutantPath).href).then((mutant) => {
    // The whole point: with the fallback back in place, the empty-BUILD_ID
    // docker shape stops refusing and hands back a plausible id instead.
    const derived = mutant.resolveBuildId({ BUILD_ID: '' });
    assert.equal(derived.source, 'DERIVED', 'mutant did not reach the derive path');
    assert.equal(derived.id, '20260728b86', 'mutant should hand back committed stamp + 1');

    // b86 against a deployed b122: the derived id is not merely wrong, it is
    // behind the field, so it cache-busts nothing while reporting success.
    assert.notEqual(derived.id, '20260802b122');

    // The fixed resolver refuses the identical input.
    const err = captureRefusal(() => mod.resolveBuildId({ BUILD_ID: '' }));
    assert.equal(err.reason, 'BUILD_ID_EMPTY');
  });
});
