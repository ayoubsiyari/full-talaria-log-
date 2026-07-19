#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createDeployPlan,
  loadManifest,
  verifyTreeLayout,
} from './lib/checkpoint-provenance.mjs';

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const equals = arg.indexOf('=');
    if (!arg.startsWith('--') || equals === -1) continue;
    result[arg.slice(2, equals)] = arg.slice(equals + 1);
  }
  return result;
}

function fail(message) {
  console.error(`[checkpoint-image-preflight] ${message}`);
  process.exit(1);
}

function docker(args, { allowFailure = false } = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `docker ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
  return {
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function inspectLabels(imageRef) {
  const raw = docker([
    'image',
    'inspect',
    imageRef,
    '--format',
    '{{json .Config.Labels}}',
  ]).stdout;
  return JSON.parse(raw || '{}') || {};
}

function verifyLabels(failures, labels, plan, imageName) {
  if (labels['org.opencontainers.image.revision'] !== plan.sourceSha) {
    failures.push(`${imageName} image source-SHA label mismatch`);
  }
  if (labels['io.talaria.checkpoint.build-id'] !== plan.buildId) {
    failures.push(`${imageName} image build-id label mismatch`);
  }
  if (labels['io.talaria.checkpoint.strict'] !== '1') {
    failures.push(`${imageName} image is not marked as a strict checkpoint build`);
  }
}

function copyFromContainer(containerId, sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  docker(['cp', `${containerId}:${sourcePath}`, destinationPath]);
}

const args = parseArgs(process.argv.slice(2));
if (process.argv.includes('--provenance-guard-off')) {
  fail('--provenance-guard-off is test-harness-only and prohibited here');
}
if (!args.manifest) fail('Missing --manifest=<file>');

const { manifest } = loadManifest(args.manifest);
const plan = createDeployPlan(manifest, { rollback: args.rollback === 'true' });
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-checkpoint-images-'));
const chartRoot = path.join(tempRoot, 'chart');
const homepageParent = path.join(tempRoot, 'homepage');
const homepageChartRoot = path.join(homepageParent, 'chart');
const containers = [];

try {
  const chartLabels = inspectLabels(plan.environment.TRADING_CHART_IMAGE);
  const homepageLabels = inspectLabels(plan.environment.HOMEPAGE_IMAGE);
  const failures = [];
  verifyLabels(failures, chartLabels, plan, 'chart');
  verifyLabels(failures, homepageLabels, plan, 'homepage');

  const chartContainer = docker([
    'create',
    plan.environment.TRADING_CHART_IMAGE,
  ]).stdout;
  containers.push(chartContainer);
  const homepageContainer = docker([
    'create',
    plan.environment.HOMEPAGE_IMAGE,
  ]).stdout;
  containers.push(homepageContainer);

  fs.mkdirSync(chartRoot, { recursive: true });
  for (const directory of ['dist-v9', 'modules', 'workers', 'vendor', 'fonts', 'multichart-prod']) {
    copyFromContainer(chartContainer, `/app/${directory}`, chartRoot);
  }
  for (const file of ['chart.js', 'legacy-index.html', 'sw.js']) {
    copyFromContainer(chartContainer, `/app/${file}`, path.join(chartRoot, file));
  }
  fs.mkdirSync(homepageParent, { recursive: true });
  copyFromContainer(
    homepageContainer,
    '/usr/share/nginx/html/chart',
    homepageParent,
  );

  const uniformity = verifyTreeLayout({
    chartRoot,
    liveRoot: '',
    homepageChartRoot,
    expectedBuildId: plan.buildId,
    sourceSha: plan.sourceSha,
    requireLive: false,
  });
  failures.push(...uniformity.failures);

  const result = {
    signature: 'TALARIA_CHECKPOINT_IMAGE_PREFLIGHT_V1',
    checkpoint: manifest.checkpoint,
    mode: plan.mode,
    buildId: plan.buildId,
    sourceSha: plan.sourceSha,
    ok: failures.length === 0,
    images: {
      chart: {
        ref: plan.environment.TRADING_CHART_IMAGE,
        labels: chartLabels,
      },
      homepage: {
        ref: plan.environment.HOMEPAGE_IMAGE,
        labels: homepageLabels,
      },
    },
    uniformity: {
      ok: uniformity.ok,
      checks: uniformity.checks.length,
    },
    failures,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(`[checkpoint-image-preflight] ${error.stack || error.message}`);
  process.exitCode = 1;
} finally {
  for (const containerId of containers) {
    if (containerId) docker(['rm', '-f', containerId], { allowFailure: true });
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
