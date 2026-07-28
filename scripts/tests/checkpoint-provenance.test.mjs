import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_SCHEMA,
  createDeployPlan,
  loadManifest,
  resolveAdvertisedTagCommit,
  sha256File,
  simulateLegacyTripleIncrement,
  validateManifest,
  verifyRepositoryEvidence,
  verifyRuntimeSnapshot,
  verifyTreeLayout,
  verifyUniformityProof,
} from '../lib/checkpoint-provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const fixtureRoot = path.resolve(__dirname, '../fixtures/checkpoint-provenance');
const greenManifestPath = path.join(fixtureRoot, 'green-manifest.json');
const greenManifest = JSON.parse(fs.readFileSync(greenManifestPath, 'utf8'));

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function makeTree(buildId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-provenance-tree-'));
  const chartRoot = path.join(root, 'chart');
  const liveRoot = path.join(root, 'live');
  const homepageChartRoot = path.join(root, 'homepage-chart');
  const shell = [
    `<script>window.__TALARIA_CHART_BUILD_ID='${buildId}'</script>`,
    `<script src="/chart/modules/drawing-tools-manager.js?v=${buildId}"></script>`,
    `<script src="/chart/chart.js?v=${buildId}"></script>`,
  ].join('\n');
  const embed = [
    `<script>window.__TALARIA_CHART_BUILD_ID = p.get('v') || '${buildId}'</script>`,
    `<script src="/chart/vendor/d3.min.js?v=${buildId}"></script>`,
  ].join('\n');
  const engine = `const CHART_ENGINE_BUILD = '${buildId}';\n`;
  const sw = `const SW_VERSION = "talaria-chart-${buildId}";\n`;
  const legacy = `<script src="/chart/chart.js?v=${buildId}"></script>\n`;
  const harness = `const buildId = '${buildId}';\n`;
  const module = 'export const fixture = true;\n';

  for (const target of [chartRoot, homepageChartRoot]) {
    write(path.join(target, 'dist-v9/index.html'), shell);
    write(path.join(target, 'dist-v9/sw.js'), sw);
    write(path.join(target, 'chart.js'), engine);
    write(path.join(target, 'sw.js'), sw);
    write(path.join(target, 'modules/drawing-tools-manager.js'), module);
    write(path.join(target, 'multichart-prod/chart-embed.html'), embed);
    write(path.join(target, 'multichart-prod/harness/serve.mjs'), harness);
    for (const directory of ['workers', 'vendor', 'fonts']) {
      fs.mkdirSync(path.join(target, directory), { recursive: true });
    }
  }
  write(path.join(chartRoot, 'legacy-index.html'), legacy);
  write(path.join(liveRoot, 'index.html'), shell);
  write(path.join(liveRoot, 'public/sw.js'), sw);
  return { root, chartRoot, liveRoot, homepageChartRoot };
}

function validRuntimeSurface(buildId, hashSeed = 'a') {
  return {
    shellBuildId: buildId,
    moduleQueryBuildId: buildId,
    embedBuildId: buildId,
    engineBuildId: buildId,
    serviceWorkerBuildId: buildId,
    legacyStatus: 404,
    harnessBuildId: buildId,
    browserHostBuildId: buildId,
    browserFrameBuildIds: [buildId, buildId],
    hashes: {
      shell: `${hashSeed}1`,
      embed: `${hashSeed}2`,
      engine: `${hashSeed}3`,
      module: `${hashSeed}4`,
      serviceWorker: `${hashSeed}5`,
      harness: `${hashSeed}7`,
    },
  };
}

test('legacy fixture reproduces b86 to b89 while engine and SW remain stale', () => {
  const result = simulateLegacyTripleIncrement(
    '20260717b86',
    '20260719b01',
    '20260717b86',
  );
  assert.deepEqual(result.passes, ['20260717b87', '20260717b88', '20260717b89']);
  assert.equal(result.shellBuildId, '20260717b89');
  assert.equal(result.engineBuildId, '20260719b01');
  assert.equal(result.serviceWorkerBuildId, '20260717b86');
});

test('strict manifest accepts full SHA, digest-only images, proof, and rollback', () => {
  const result = validateManifest(greenManifest);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('legacy mutable checkpoint inputs are rejected', () => {
  const legacy = {
    schema: MANIFEST_SCHEMA,
    checkpoint: 'CKPT-010',
    buildId: '',
    source: { sha: '', remote: 'origin', ref: 'refs/heads/main' },
    images: {
      chart: { ref: 'ghcr.io/example/chart:latest', digest: '' },
      homepage: { ref: 'ghcr.io/example/homepage:latest', digest: '' },
    },
    proof: {},
    rollback: {},
    createdAt: new Date().toISOString(),
  };
  const result = validateManifest(legacy);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /buildId/);
  assert.match(result.errors.join('\n'), /source\.sha/);
  assert.match(result.errors.join('\n'), /digest-only|sha256/);
  assert.match(result.errors.join('\n'), /refs\/tags/);
});

test('deployment plan contains exact digests and cannot build', () => {
  const plan = createDeployPlan(greenManifest);
  assert.equal(plan.buildAllowed, false);
  assert.match(plan.environment.TRADING_CHART_IMAGE, /@sha256:a{64}$/);
  assert.match(plan.environment.HOMEPAGE_IMAGE, /@sha256:b{64}$/);
  assert.equal(plan.sourceSha, greenManifest.source.sha);
  assert.equal(JSON.stringify(plan).includes(':latest'), false);
  assert.match(plan.commands[0], /@sha256:a{64}.*docker compose pull/);
  assert.match(plan.commands[1], /docker compose up -d --no-build --no-deps/);
});

test('rollback plan remains pinned to the previously accepted digests', () => {
  const plan = createDeployPlan(greenManifest, { rollback: true });
  assert.equal(plan.mode, 'rollback');
  assert.equal(plan.sourceSha, greenManifest.rollback.sourceSha);
  assert.match(plan.environment.TRADING_CHART_IMAGE, /@sha256:d{64}$/);
  assert.match(plan.environment.HOMEPAGE_IMAGE, /@sha256:e{64}$/);
});

test('dirty, wrong-HEAD, and wrong-remote repository evidence fail closed', () => {
  const result = verifyRepositoryEvidence(greenManifest, {
    dirty: true,
    headSha: '3'.repeat(40),
    remoteSha: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 3);
});

test('annotated remote tag preflight resolves the peeled commit', (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-preflight-tag-'));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  const run = (args) => {
    const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  run(['init', '--quiet']);
  run(['config', 'user.name', 'Checkpoint Test']);
  run(['config', 'user.email', 'checkpoint@example.invalid']);
  write(path.join(repository, 'tracked.txt'), 'checkpoint\n');
  run(['add', 'tracked.txt']);
  run(['commit', '--quiet', '-m', 'checkpoint source']);
  const commitSha = run(['rev-parse', 'HEAD']);
  run(['tag', '-a', 'checkpoint-source', '-m', 'annotated source']);
  const tagObjectSha = run(['rev-parse', 'checkpoint-source^{object}']);
  const advertisement = run([
    'ls-remote', repository,
    'refs/tags/checkpoint-source', 'refs/tags/checkpoint-source^{}',
  ]);
  const resolved = resolveAdvertisedTagCommit(
    advertisement,
    'refs/tags/checkpoint-source',
  );
  assert.deepEqual(resolved, { tagObjectSha, commitSha, annotated: true });
  assert.equal(run(['cat-file', '-t', resolved.commitSha]), 'commit');
});

test('uniform tree passes exact build and I8 checks', () => {
  const tree = makeTree(greenManifest.buildId);
  try {
    const report = verifyTreeLayout({
      ...tree,
      expectedBuildId: greenManifest.buildId,
      sourceSha: greenManifest.source.sha,
    });
    assert.equal(report.ok, true, report.failures.join('\n'));
  } finally {
    fs.rmSync(tree.root, { recursive: true, force: true });
  }
});

test('uniformity allows only the exact Q6 canonical-forwarding wrapper', () => {
  const tree = makeTree(greenManifest.buildId);
  try {
    const relative = 'modules/m20-q6-replay-lifecycle-binding.test.mjs';
    write(path.join(tree.chartRoot, relative), 'import assert from "node:assert/strict";\n');
    write(
      path.join(tree.homepageChartRoot, relative),
      '// Mirrored entrypoint: execute the canonical-root Q6 lifecycle harness.\n'
        + "import '../../../../chart v 1.4/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs';\n",
    );
    const report = verifyTreeLayout({
      ...tree,
      expectedBuildId: greenManifest.buildId,
      sourceSha: greenManifest.source.sha,
    });
    assert.equal(report.ok, true, report.failures.join('\n'));
    assert.ok(report.checks.some((check) =>
      check.name === `I8 ${relative} forwarding-contract`));
    const mirror = report.forwardingMirrors[0];
    assert.equal(mirror.contractId, 'q6-canonical-harness/homepage-forwarding-wrapper-v1');
    assert.notEqual(mirror.canonicalHash, mirror.wrapperHash);
    assert.equal(mirror.canonicalHash, mirror.effectiveCanonicalTargetHash);
  } finally {
    fs.rmSync(tree.root, { recursive: true, force: true });
  }
});

test('uniformity rejects modified and wrong-target Q6 wrappers', () => {
  for (const wrapper of [
    '// modified\n'
      + "import '../../../../chart v 1.4/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs';\n",
    '// Mirrored entrypoint: execute the canonical-root Q6 lifecycle harness.\n'
      + "import '../../../../chart v 1.4/chart/modules/m20-q6-replay-lifecycle-strong.test.mjs';\n",
  ]) {
    const tree = makeTree(greenManifest.buildId);
    try {
      const relative = 'modules/m20-q6-replay-lifecycle-binding.test.mjs';
      write(path.join(tree.chartRoot, relative), 'import assert from "node:assert/strict";\n');
      write(path.join(tree.homepageChartRoot, relative), wrapper);
      const report = verifyTreeLayout({
        ...tree,
        expectedBuildId: greenManifest.buildId,
        sourceSha: greenManifest.source.sha,
      });
      assert.equal(report.ok, false);
      assert.match(report.failures.join('\n'), /m20-q6-replay-lifecycle-binding.*hash mismatch/);
    } finally {
      fs.rmSync(tree.root, { recursive: true, force: true });
    }
  }
});

test('stale service worker breaks uniformity', () => {
  const tree = makeTree(greenManifest.buildId);
  try {
    write(
      path.join(tree.homepageChartRoot, 'sw.js'),
      'const SW_VERSION = "talaria-chart-20991231b98";\n',
    );
    const report = verifyTreeLayout({
      ...tree,
      expectedBuildId: greenManifest.buildId,
      sourceSha: greenManifest.source.sha,
    });
    assert.equal(report.ok, false);
    assert.match(report.failures.join('\n'), /homepage SW|I8 sw\.js/);
  } finally {
    fs.rmSync(tree.root, { recursive: true, force: true });
  }
});

test('direct/public runtime mismatch is a hard failure', () => {
  const direct = validRuntimeSurface(greenManifest.buildId);
  const publicSurface = validRuntimeSurface(greenManifest.buildId);
  publicSurface.shellBuildId = '20991231b98';
  publicSurface.hashes.shell = 'different';
  const report = verifyRuntimeSnapshot(
    { direct, public: publicSurface },
    greenManifest,
  );
  assert.equal(report.ok, false);
  assert.match(report.failures.join('\n'), /public\.shellBuildId|hash mismatch/);
});

test('uniformity proof is bound by hash, source SHA, and build id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-provenance-proof-'));
  try {
    const proofPath = path.join(root, 'proof.json');
    write(proofPath, `${JSON.stringify({
      signature: 'TALARIA_CHECKPOINT_UNIFORMITY_V2',
      ok: true,
      expectedBuildId: greenManifest.buildId,
      sourceSha: greenManifest.source.sha,
      forwardingMirrors: [],
    })}\n`);
    const manifestPath = path.join(root, 'manifest.json');
    const manifest = structuredClone(greenManifest);
    manifest.proof.uniformityReport = 'proof.json';
    manifest.proof.sha256 = sha256File(proofPath);
    write(manifestPath, `${JSON.stringify(manifest)}\n`);
    const loaded = loadManifest(manifestPath);
    const result = verifyUniformityProof(loaded.manifest, loaded.manifestPath);
    assert.equal(result.ok, true, result.failures.join('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('production CLI refuses the harness-only guard-off argument', () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/checkpoint-provenance.mjs'),
      'help',
      '--provenance-guard-off',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test-harness-only/);
});

test('Docker and deploy wiring preserve separate SHA/build ids and copy generated SW', () => {
  const chartDockerfile = fs.readFileSync(
    path.join(repoRoot, 'chart v 1.4/chart/Dockerfile.local'),
    'utf8',
  );
  const homepageDockerfile = fs.readFileSync(
    path.join(repoRoot, 'homepage/Dockerfile'),
    'utf8',
  );
  for (const content of [chartDockerfile, homepageDockerfile]) {
    assert.match(content, /ARG CHECKPOINT_BUILD/);
    assert.match(content, /ARG CHART_BUILD_ID/);
    assert.match(content, /ARG SOURCE_COMMIT_SHA/);
    assert.match(content, /checkpoint-build-assert\.mjs inputs/);
    assert.match(content, /node \/build\/chart\/modules\/m19-progressive-session-soak\.test\.mjs/);
    assert.match(content, /io\.talaria\.checkpoint\.strict/);
    assert.match(content, /\/build\/chart\/sw\.js/);
    assert.doesNotMatch(content, /ENV BUILD_ID=\$\{GIT_COMMIT\}/);
  }

  const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8');
  assert.equal((compose.match(/CHECKPOINT_BUILD: \$\{CHECKPOINT_BUILD:-0\}/g) || []).length, 3);
  assert.equal((compose.match(/CHART_BUILD_ID: \$\{CHART_BUILD_ID:-\}/g) || []).length, 3);
  assert.equal((compose.match(/SOURCE_COMMIT_SHA: \$\{SOURCE_COMMIT_SHA:-\}/g) || []).length, 3);

  const deploy = fs.readFileSync(path.join(repoRoot, 'scripts/deploy.sh'), 'utf8');
  assert.match(deploy, /--manifest is required/);
  assert.match(deploy, /checkpoint-provenance\.mjs" preflight/);
  assert.match(deploy, /checkpoint-image-preflight\.mjs/);
  assert.match(deploy, /checkpoint-runtime-probe\.mjs/);
  assert.match(deploy, /docker compose up -d --no-build/);
  assert.doesNotMatch(deploy, /IMAGE_TAG:-latest|docker compose build/);

  const vpsDeploy = fs.readFileSync(
    path.join(repoRoot, 'scripts/vps-deploy-after-pull.sh'),
    'utf8',
  );
  assert.match(vpsDeploy, /can mutate chart\/homepage without immutable provenance/);
  assert.doesNotMatch(vpsDeploy, /docker compose build (homepage|trading-chart)/);

  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/build-images.yml'),
    'utf8',
  );
  assert.match(workflow, /CHECKPOINT_BUILD=0/);
  assert.match(workflow, /SOURCE_COMMIT_SHA=\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(workflow, /GIT_COMMIT=\$\{\{ github\.sha \}\}/);
});
