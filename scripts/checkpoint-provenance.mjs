#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_SCHEMA,
  createDeployPlan,
  loadManifest,
  resolveAdvertisedTagCommit,
  sha256File,
  validateManifest,
  verifyRepositoryEvidence,
  verifyRuntimeSnapshot,
  verifyTreeLayout,
  verifyUniformityProof,
} from './lib/checkpoint-provenance.mjs';
import { validateModuleContracts } from './module-contract-preflight.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, '..');

function fail(message, code = 2) {
  console.error(`[checkpoint-provenance] ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const result = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const equals = arg.indexOf('=');
    if (equals === -1) {
      result[arg.slice(2)] = true;
    } else {
      result[arg.slice(2, equals)] = arg.slice(equals + 1);
    }
  }
  return result;
}

function required(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) fail(`Missing --${name}=...`);
  return value.trim();
}

function git(repoRoot, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 && !allowFailure) {
    fail(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return {
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function layoutForRepo(repoRoot) {
  return {
    chartRoot: path.join(repoRoot, 'chart v 1.4/chart'),
    liveRoot: path.join(repoRoot, 'chart v 1.4/talaria-design/live'),
    homepageChartRoot: path.join(repoRoot, 'homepage/public/chart'),
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function commandValidateManifest(args) {
  const { manifest } = loadManifest(required(args, 'manifest'));
  printJson({
    signature: 'TALARIA_CHECKPOINT_MANIFEST_VALID_V1',
    ok: true,
    checkpoint: manifest.checkpoint,
    buildId: manifest.buildId,
    sourceSha: manifest.source.sha,
    images: manifest.images,
  });
}

function commandVerifyManifest(args) {
  const repoRoot = path.resolve(args['repo-root'] || defaultRepoRoot);
  const { manifest, manifestPath } = loadManifest(required(args, 'manifest'));
  const proof = verifyUniformityProof(manifest, manifestPath, { repoRoot });
  const result = {
    signature: 'TALARIA_CHECKPOINT_MANIFEST_VERIFIED_V1',
    ok: proof.ok,
    checkpoint: manifest.checkpoint,
    buildId: manifest.buildId,
    sourceSha: manifest.source.sha,
    images: manifest.images,
    proof: {
      path: proof.proofPath,
      sha256: proof.actualHash || null,
      ok: proof.ok,
    },
    failures: proof.failures,
  };
  printJson(result);
  if (!result.ok) process.exit(1);
}

function commandUniformity(args) {
  const repoRoot = path.resolve(args['repo-root'] || defaultRepoRoot);
  const expectedBuildId = required(args, 'build-id');
  const sourceSha = required(args, 'source-sha');
  const report = verifyTreeLayout({
    ...layoutForRepo(repoRoot),
    expectedBuildId,
    sourceSha,
  });
  if (typeof args.output === 'string' && args.output.trim()) {
    const outputPath = path.resolve(args.output);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  printJson(report);
  if (!report.ok) process.exit(1);
}

function commandPreflight(args) {
  const repoRoot = path.resolve(args['repo-root'] || defaultRepoRoot);
  try {
    validateModuleContracts({ root: repoRoot });
  } catch (error) {
    fail(`module contract preflight failed: ${error.message}`, 1);
  }
  const loaded = loadManifest(required(args, 'manifest'));
  const { manifest, manifestPath } = loaded;
  const status = git(repoRoot, ['status', '--porcelain', '--untracked-files=all']).stdout;
  const headSha = git(repoRoot, ['rev-parse', 'HEAD']).stdout;
  const remoteOutput = git(repoRoot, [
    'ls-remote',
    manifest.source.remote,
    manifest.source.ref,
    `${manifest.source.ref}^{}`,
  ], { allowFailure: true });
  let remoteSha = null;
  let remoteTagObjectSha = null;
  let remoteAnnotated = null;
  let remoteResolutionFailure = null;
  if (remoteOutput.status === 0) {
    try {
      const resolved = resolveAdvertisedTagCommit(remoteOutput.stdout, manifest.source.ref);
      remoteSha = resolved.commitSha;
      remoteTagObjectSha = resolved.tagObjectSha;
      remoteAnnotated = resolved.annotated;
      const remoteType = git(repoRoot, ['cat-file', '-t', remoteSha], { allowFailure: true });
      if (remoteType.status !== 0 || remoteType.stdout !== 'commit') {
        remoteResolutionFailure = `remote tag target ${remoteSha} is not a locally verified commit`;
        remoteSha = null;
      }
    } catch (error) {
      remoteResolutionFailure = error.message;
    }
  } else {
    remoteResolutionFailure = remoteOutput.stderr || 'remote tag lookup failed';
  }

  const repository = verifyRepositoryEvidence(manifest, {
    dirty: status.length > 0,
    headSha,
    remoteSha,
  });
  const proof = verifyUniformityProof(manifest, manifestPath, { repoRoot });
  const uniformity = verifyTreeLayout({
    ...layoutForRepo(repoRoot),
    expectedBuildId: manifest.buildId,
    sourceSha: manifest.source.sha,
  });
  const failures = [
    ...(remoteResolutionFailure ? [remoteResolutionFailure] : []),
    ...repository.failures,
    ...proof.failures,
    ...uniformity.failures,
  ];
  const result = {
    signature: 'TALARIA_CHECKPOINT_PREFLIGHT_V1',
    checkpoint: manifest.checkpoint,
    buildId: manifest.buildId,
    sourceSha: manifest.source.sha,
    ok: failures.length === 0,
    repository: {
      dirty: status.length > 0,
      headSha,
      remote: manifest.source.remote,
      remoteRef: manifest.source.ref,
      remoteTagObjectSha,
      remoteAnnotated,
      remoteSha,
      ok: repository.ok,
    },
    proof: {
      path: proof.proofPath,
      sha256: proof.actualHash || null,
      ok: proof.ok,
    },
    uniformity: {
      ok: uniformity.ok,
      checks: uniformity.checks.length,
    },
    images: manifest.images,
    rollback: manifest.rollback,
    failures,
  };
  printJson(result);
  if (!result.ok) process.exit(1);
}

function commandPlan(args) {
  const { manifest } = loadManifest(required(args, 'manifest'));
  printJson(createDeployPlan(manifest, { rollback: args.rollback === true }));
}

function commandFields(args) {
  const { manifest } = loadManifest(required(args, 'manifest'));
  const plan = createDeployPlan(manifest, { rollback: args.rollback === true });
  for (const value of [
    plan.sourceSha,
    plan.buildId,
    plan.environment.TRADING_CHART_IMAGE,
    plan.environment.HOMEPAGE_IMAGE,
    plan.imageDigests.chart,
    plan.imageDigests.homepage,
  ]) {
    process.stdout.write(`${value}\n`);
  }
}

function commandRuntimeSnapshot(args) {
  const { manifest } = loadManifest(required(args, 'manifest'));
  const snapshotPath = path.resolve(required(args, 'snapshot'));
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const result = verifyRuntimeSnapshot(snapshot, manifest);
  printJson(result);
  if (!result.ok) process.exit(1);
}

function commandCreateManifest(args) {
  const proofPath = required(args, 'proof');
  const manifest = {
    schema: MANIFEST_SCHEMA,
    checkpoint: required(args, 'checkpoint'),
    buildId: required(args, 'build-id'),
    source: {
      sha: required(args, 'source-sha'),
      remote: required(args, 'remote'),
      ref: required(args, 'remote-ref'),
    },
    images: {
      chart: {
        ref: required(args, 'chart-ref'),
        digest: required(args, 'chart-digest'),
      },
      homepage: {
        ref: required(args, 'homepage-ref'),
        digest: required(args, 'homepage-digest'),
      },
    },
    proof: {
      uniformityReport: proofPath,
      sha256: required(args, 'proof-sha256'),
    },
    rollback: {
      buildId: required(args, 'rollback-build-id'),
      sourceSha: required(args, 'rollback-source-sha'),
      images: {
        chart: {
          ref: required(args, 'rollback-chart-ref'),
          digest: required(args, 'rollback-chart-digest'),
        },
        homepage: {
          ref: required(args, 'rollback-homepage-ref'),
          digest: required(args, 'rollback-homepage-digest'),
        },
      },
    },
    createdAt: args['created-at'] || new Date().toISOString(),
  };
  const validation = validateManifest(manifest);
  if (!validation.ok) fail(`Refusing invalid manifest:\n- ${validation.errors.join('\n- ')}`);
  const outputPath = path.resolve(required(args, 'output'));
  if (fs.existsSync(outputPath) && args.force !== true) {
    fail(`Refusing to overwrite ${outputPath}; pass --force only for an intentional replacement`);
  }
  const provisionalManifestPath = path.join(path.dirname(outputPath), path.basename(outputPath));
  const proof = verifyUniformityProof(manifest, provisionalManifestPath, {
    repoRoot: path.resolve(args['repo-root'] || defaultRepoRoot),
  });
  if (!proof.ok) fail(`Refusing manifest with invalid uniformity proof:\n- ${proof.failures.join('\n- ')}`);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  printJson({
    signature: 'TALARIA_CHECKPOINT_MANIFEST_CREATED_V1',
    ok: true,
    path: outputPath,
    sha256: sha256File(outputPath),
    checkpoint: manifest.checkpoint,
    buildId: manifest.buildId,
    sourceSha: manifest.source.sha,
  });
}

function usage() {
  process.stdout.write(`Talaria immutable checkpoint provenance guard

Commands:
  validate-manifest --manifest=<file>
  verify-manifest --manifest=<file> [--repo-root=<dir>]
  uniformity --build-id=YYYYMMDDbN --source-sha=<40hex> [--repo-root=<dir>] [--output=<json>]
  preflight --manifest=<file> [--repo-root=<dir>]
  plan --manifest=<file> [--rollback]
  fields --manifest=<file> [--rollback]
  verify-runtime-snapshot --manifest=<file> --snapshot=<json>
  create-manifest --checkpoint=CKPT-N --build-id=... --source-sha=... --remote=origin
    --remote-ref=refs/tags/... --chart-ref=<digest-ref> --chart-digest=sha256:...
    --homepage-ref=<digest-ref> --homepage-digest=sha256:... --proof=<relative-json>
    --proof-sha256=<64hex> --rollback-build-id=... --rollback-source-sha=...
    --rollback-chart-ref=<digest-ref> --rollback-chart-digest=sha256:...
    --rollback-homepage-ref=<digest-ref> --rollback-homepage-digest=sha256:...
    --output=<manifest.json> [--repo-root=<dir>]

The test-only --provenance-guard-off discriminator is deliberately unavailable here.
`);
}

const args = parseArgs(process.argv.slice(2));
if (Object.prototype.hasOwnProperty.call(args, 'provenance-guard-off')) {
  fail('--provenance-guard-off is test-harness-only and prohibited in production commands');
}
const command = args._[0];
if (!command || command === 'help' || args.help === true) {
  usage();
  process.exit(0);
}

const commands = {
  'validate-manifest': commandValidateManifest,
  'verify-manifest': commandVerifyManifest,
  uniformity: commandUniformity,
  preflight: commandPreflight,
  plan: commandPlan,
  fields: commandFields,
  'verify-runtime-snapshot': commandRuntimeSnapshot,
  'create-manifest': commandCreateManifest,
};

if (!commands[command]) fail(`Unknown command: ${command}`);
commands[command](args);
