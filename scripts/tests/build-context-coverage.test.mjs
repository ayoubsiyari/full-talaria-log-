/**
 * BUILD-CONTEXT-01 — the checkpoint image must carry every file the build imports.
 *
 * Two allowlists inside each Dockerfile decide what the containerised build can
 * see, and both are maintained by hand:
 *
 *   /contract-root  mirrors named by scripts/module-contracts.json. Canonical
 *                   paths arrive by symlink to the whole chart tree, so only
 *                   mirrors need naming — which is exactly why they get missed.
 *   /scripts        repo-root scripts imported from inside the copied trees.
 *
 * Both were breached on the same tag. A contract declared a mirror the context
 * never copied, and a provenance guard was imported by a build script the
 * context never copied. In both cases the file was present and tracked in the
 * repository, the local build passed, and only the image build failed — the
 * signature of something bound to nothing.
 *
 * This gate reads the real Dockerfiles and the real contract file. It fails
 * with a distinct ANCHOR_BROKEN when it cannot find what it parses, so a gate
 * that has lost its grip never reports as a clean build.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const ROOT = findRoot(__dirname);

const DOCKERFILES = {
  chart: 'chart v 1.4/chart/Dockerfile.local',
  homepage: 'homepage/Dockerfile',
};

/** Trees copied wholesale into the image; anything inside them is carried. */
const COPIED_TREES = ['chart v 1.4/talaria-design/', 'chart v 1.4/chart/'];

/** Scripts the checkpoint build actually executes, relative to the repo root. */
const BUILD_ENTRYPOINTS = [
  'chart v 1.4/chart/scripts/bump-chart-engine-build.mjs',
  'chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs',
  'chart v 1.4/talaria-design/scripts/sync-v9-to-homepage.mjs',
  'scripts/module-contract-preflight.mjs',
];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`ANCHOR_BROKEN: ${rel} is absent`);
  return fs.readFileSync(abs, 'utf8');
}

/** Every COPY destination in a Dockerfile, as image-absolute paths. */
function copyDestinations(dockerfileSrc) {
  const dests = [];
  const re = /^\s*COPY\s*\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/gm;
  let m;
  while ((m = re.exec(dockerfileSrc))) dests.push({ from: m[1], to: m[2] });
  return dests;
}

function coversImagePath(dests, imagePath) {
  return dests.some(({ to }) => {
    if (to === imagePath) return true;
    const prefix = to.endsWith('/') ? to : `${to}/`;
    return imagePath.startsWith(prefix);
  });
}

const dockerfiles = Object.fromEntries(
  Object.entries(DOCKERFILES).map(([name, rel]) => [name, copyDestinations(read(rel))]),
);

for (const [name, dests] of Object.entries(dockerfiles)) {
  if (dests.length === 0) throw new Error(`ANCHOR_BROKEN: no COPY pairs parsed from ${DOCKERFILES[name]}`);
}

function contractMirrors() {
  const parsed = JSON.parse(read('scripts/module-contracts.json'));
  const modules = parsed.modules || parsed.contracts;
  if (!Array.isArray(modules)) throw new Error('ANCHOR_BROKEN: module-contracts.json has no module list');
  return modules.flatMap((c) => (c.mirrors || []).map((mirror) => ({ id: c.id, mirror })));
}

/**
 * Repo-relative import targets reached from the build entry points, following
 * relative imports transitively. Only targets that escape the wholesale-copied
 * trees matter: those are the ones an allowlist has to name.
 */
function escapingImports() {
  const seen = new Set();
  const escapes = [];
  const queue = [...BUILD_ENTRYPOINTS];

  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);

    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');

    const re = /(?:from|import)\s+["'](\.[^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) {
      const targetAbs = path.resolve(path.dirname(abs), m[1]);
      const targetRel = path.relative(ROOT, targetAbs).split(path.sep).join('/');
      if (targetRel.startsWith('..')) continue;
      queue.push(targetRel);
      const inCopiedTree = COPIED_TREES.some((t) => targetRel.startsWith(t));
      if (!inCopiedTree) escapes.push({ importer: rel, target: targetRel });
    }
  }
  return escapes;
}

test('BUILDCTX: present — both Dockerfiles parse and declare allowlists', () => {
  for (const [name, dests] of Object.entries(dockerfiles)) {
    assert.ok(dests.length > 0, `${name}: no COPY pairs`);
    assert.ok(
      dests.some((d) => d.to.startsWith('/contract-root/')),
      `${name}: no /contract-root allowlist — the mirror mechanism has moved`,
    );
    assert.ok(
      dests.some((d) => d.to.startsWith('/scripts/')),
      `${name}: no /scripts allowlist — the import mechanism has moved`,
    );
  }
});

test('BUILDCTX: bound — every contract mirror is carried into /contract-root', () => {
  const mirrors = contractMirrors();
  assert.ok(mirrors.length > 0, 'GATE_VACUOUS: no contract mirrors to check');

  const gaps = [];
  for (const { id, mirror } of mirrors) {
    for (const [name, dests] of Object.entries(dockerfiles)) {
      if (!coversImagePath(dests, `/contract-root/${mirror}`)) gaps.push(`${id} → ${mirror} [${name}]`);
    }
  }
  assert.deepEqual(gaps, [], `contract mirrors absent from the build context:\n  ${gaps.join('\n  ')}`);
});

test('BUILDCTX: bound — every escaping build import is carried into the image', () => {
  const escapes = escapingImports();
  assert.ok(escapes.length > 0, 'GATE_VACUOUS: no escaping imports found — the entry point list has gone stale');

  const gaps = [];
  for (const { importer, target } of escapes) {
    // Repo-root `scripts/x` is reached as `/scripts/x` from inside the copied trees.
    const imagePath = target.startsWith('scripts/') ? `/${target}` : `/${target}`;
    for (const [name, dests] of Object.entries(dockerfiles)) {
      if (!coversImagePath(dests, imagePath)) gaps.push(`${importer} → ${target} [${name}]`);
    }
  }
  assert.deepEqual(gaps, [], `build scripts import files the image does not carry:\n  ${gaps.join('\n  ')}`);
});

test('BUILDCTX: mutant — dropping the SessionCalendar mirror COPY is caught', () => {
  const mutated = copyDestinations(
    read(DOCKERFILES.chart).replace(
      /^.*COPY \["homepage\/public\/chart\/modules\/session-calendar\.js".*$/m,
      '',
    ),
  );
  assert.notDeepEqual(
    mutated.map((d) => d.to),
    dockerfiles.chart.map((d) => d.to),
    'MUTANT_INERT: the session-calendar COPY line was not found to remove',
  );
  assert.equal(
    coversImagePath(mutated, '/contract-root/homepage/public/chart/modules/session-calendar.js'),
    false,
    'the check would not notice the mirror going missing',
  );
});

test('BUILDCTX: mutant — dropping the clean-build-tree-guard COPY is caught', () => {
  const mutated = copyDestinations(
    read(DOCKERFILES.homepage).replace(
      /^.*COPY \["scripts\/clean-build-tree-guard\.mjs".*$/m,
      '',
    ),
  );
  assert.notDeepEqual(
    mutated.map((d) => d.to),
    dockerfiles.homepage.map((d) => d.to),
    'MUTANT_INERT: the guard COPY line was not found to remove',
  );
  assert.equal(
    coversImagePath(mutated, '/scripts/clean-build-tree-guard.mjs'),
    false,
    'the check would not notice the guard going missing',
  );
});

test('BUILDCTX: anti-vacuity — a path nothing copies is reported as absent', () => {
  for (const [name, dests] of Object.entries(dockerfiles)) {
    assert.equal(
      coversImagePath(dests, '/contract-root/homepage/public/chart/modules/no-such-module.js'),
      false,
      `${name}: coverage check claims to carry a file that does not exist`,
    );
  }
});

test('BUILDCTX: anti-vacuity — directory copies cover the files beneath them', () => {
  // dist-v9 is copied as a directory; a mirror inside it must count as carried,
  // or the gate would demand a COPY line per file and be abandoned as noise.
  assert.equal(
    coversImagePath(dockerfiles.chart, '/contract-root/homepage/public/chart/dist-v9/index.html'),
    true,
    'directory copies are not being honoured',
  );
});
