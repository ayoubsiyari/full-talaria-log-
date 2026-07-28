import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dockerfiles = [
  'chart v 1.4/chart/Dockerfile.local',
  'homepage/Dockerfile',
];
const entrypoint = '/build/checkpoint-tools/checkpoint-build-assert.mjs';
const wrapperDestination =
  '/homepage/public/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs';

function checkpointCopyMap(dockerfile) {
  const copies = new Map();
  for (const [index, line] of dockerfile.split(/\r?\n/).entries()) {
    const match = /^COPY\s+(\[.*\])\s*$/.exec(line.trim());
    if (!match) continue;
    const fields = JSON.parse(match[1]);
    if (fields.length !== 2) continue;
    const destination = path.posix.normalize(
      fields[1].startsWith('/') ? fields[1] : `/build/${fields[1].replace(/^\.\//, '')}`,
    );
    copies.set(destination, { source: fields[0], index });
  }
  return copies;
}

function assertClosedLocalImportGraph(dockerfile, readSource) {
  const copies = checkpointCopyMap(dockerfile);
  const visited = new Set();

  function visit(destination) {
    if (visited.has(destination)) return;
    visited.add(destination);
    const copy = copies.get(destination);
    assert.ok(copy, `missing explicit COPY for local import ${destination}`);
    const { source } = copy;
    const content = readSource(source);
    assert.equal(typeof content, 'string', `missing build-context source ${source}`);
    const imports = content.matchAll(
      /^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"](\.[^'"]+)['"]/gm,
    );
    for (const match of imports) {
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(destination), match[1]),
      );
      visit(dependency);
    }
  }

  visit(entrypoint);
  const syncSource = 'chart v 1.4/talaria-design/scripts/sync-homepage-modules.mjs';
  const syncDestination = '/build/talaria-design/scripts/sync-homepage-modules.mjs';
  for (const match of readSource(syncSource).matchAll(
    /^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"](\.[^'"]+)['"]/gm,
  )) {
    visit(path.posix.normalize(path.posix.join(path.posix.dirname(syncDestination), match[1])));
  }
  assert.ok(copies.has(wrapperDestination), `missing explicit COPY for input ${wrapperDestination}`);
  return { copies, visited };
}

test('checkpoint Docker stages explicitly copy their complete local import graph', () => {
  for (const dockerfilePath of dockerfiles) {
    const dockerfile = fs.readFileSync(path.join(repoRoot, dockerfilePath), 'utf8');
    const { copies, visited } = assertClosedLocalImportGraph(
      dockerfile,
      (source) => fs.readFileSync(path.join(repoRoot, source), 'utf8'),
    );
    assert.deepEqual(
      [...visited].sort(),
      [
        '/build/checkpoint-tools/checkpoint-build-assert.mjs',
        '/build/checkpoint-tools/lib/checkpoint-provenance.mjs',
        '/build/checkpoint-tools/lib/homepage-forwarding-contracts.mjs',
        '/scripts/lib/homepage-forwarding-contracts.mjs',
      ],
      dockerfilePath,
    );
    assert.equal(
      copies.get(wrapperDestination)?.source,
      'homepage/public/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs',
      `${dockerfilePath} must seed the authoritative homepage wrapper`,
    );
    const wrapper = fs.readFileSync(
      path.join(repoRoot, copies.get(wrapperDestination).source),
      'utf8',
    );
    for (const match of wrapper.matchAll(
      /^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"](\.[^'"]+)['"]/gm,
    )) {
      assert.ok(
        fs.existsSync(path.resolve(
          repoRoot,
          path.dirname(copies.get(wrapperDestination).source),
          match[1],
        )),
        `wrapper local input is missing: ${match[1]}`,
      );
    }
    const syncRunIndex = dockerfile.split(/\r?\n/).findIndex((line) =>
      line.includes('npm run build:live:chart'));
    for (const destination of [
      '/scripts/lib/homepage-forwarding-contracts.mjs',
      '/scripts/module-contract-preflight.mjs',
      '/scripts/module-contracts.json',
      wrapperDestination,
    ]) {
      assert.ok(copies.get(destination).index < syncRunIndex, `${destination} must precede sync`);
    }
  }
});

test('checkpoint Docker import audit fails closed for omitted and unknown local imports', () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, dockerfiles[0]), 'utf8');
  const omitted = dockerfile
    .split(/\r?\n/)
    .filter((line) => !line.includes('homepage-forwarding-contracts.mjs'))
    .join('\n');
  assert.throws(
    () => assertClosedLocalImportGraph(
      omitted,
      (source) => fs.readFileSync(path.join(repoRoot, source), 'utf8'),
    ),
    /missing explicit COPY.*homepage-forwarding-contracts/,
  );
  const wrapperOmitted = dockerfile
    .split(/\r?\n/)
    .filter((line) => !line.includes('m20-q6-replay-lifecycle-binding.test.mjs'))
    .join('\n');
  assert.throws(
    () => assertClosedLocalImportGraph(
      wrapperOmitted,
      (source) => fs.readFileSync(path.join(repoRoot, source), 'utf8'),
    ),
    /missing explicit COPY for input.*m20-q6/,
  );

  assert.throws(
    () => assertClosedLocalImportGraph(
      dockerfile,
      (source) => source.endsWith('sync-homepage-modules.mjs')
        ? "import './unknown-local-contract.mjs';\n"
        : fs.readFileSync(path.join(repoRoot, source), 'utf8'),
    ),
    /missing explicit COPY.*unknown-local-contract/,
  );
});
