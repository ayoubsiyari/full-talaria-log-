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

function checkpointCopyMap(dockerfile) {
  const copies = new Map();
  for (const line of dockerfile.split(/\r?\n/)) {
    const match = /^COPY\s+(\[.*\])\s*$/.exec(line.trim());
    if (!match) continue;
    const fields = JSON.parse(match[1]);
    if (fields.length !== 2) continue;
    const destination = path.posix.normalize(
      fields[1].startsWith('/') ? fields[1] : `/build/${fields[1].replace(/^\.\//, '')}`,
    );
    copies.set(destination, fields[0]);
  }
  return copies;
}

function assertClosedLocalImportGraph(dockerfile, readSource) {
  const copies = checkpointCopyMap(dockerfile);
  const visited = new Set();

  function visit(destination) {
    if (visited.has(destination)) return;
    visited.add(destination);
    const source = copies.get(destination);
    assert.ok(source, `missing explicit COPY for local import ${destination}`);
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
  return visited;
}

test('checkpoint Docker stages explicitly copy their complete local import graph', () => {
  for (const dockerfilePath of dockerfiles) {
    const dockerfile = fs.readFileSync(path.join(repoRoot, dockerfilePath), 'utf8');
    const visited = assertClosedLocalImportGraph(
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
