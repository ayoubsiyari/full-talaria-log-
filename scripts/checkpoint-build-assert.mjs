#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  BUILD_ID_RE,
  SOURCE_SHA_RE,
  verifyTreeLayout,
} from './lib/checkpoint-provenance.mjs';

function parseArgs(argv) {
  const result = { _: [] };
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const [key, ...rest] = arg.slice(2).split('=');
    result[key] = rest.length ? rest.join('=') : true;
  }
  return result;
}

function fail(message) {
  console.error(`[checkpoint-build-assert] ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (Object.prototype.hasOwnProperty.call(args, 'provenance-guard-off')) {
  fail('--provenance-guard-off is not available in build tooling');
}

const command = args._[0];
const buildId = String(args['build-id'] || '').trim();
const sourceSha = String(args['source-sha'] || '').trim();

if (command === 'inputs') {
  if (String(args.strict) !== '1') fail('checkpoint strict mode must equal 1');
  if (!BUILD_ID_RE.test(buildId)) fail('build id must match YYYYMMDDbN');
  if (!SOURCE_SHA_RE.test(sourceSha)) fail('source SHA must be full 40-character hex');
  console.log(JSON.stringify({
    signature: 'TALARIA_CHECKPOINT_BUILD_INPUTS_V1',
    ok: true,
    buildId,
    sourceSha,
  }));
  process.exit(0);
}

if (command === 'layout') {
  if (!BUILD_ID_RE.test(buildId)) fail('build id must match YYYYMMDDbN');
  if (!SOURCE_SHA_RE.test(sourceSha)) fail('source SHA must be full 40-character hex');
  const outputPath = args.output ? path.resolve(String(args.output)) : null;
  const report = verifyTreeLayout({
    chartRoot: path.resolve(String(args['chart-root'] || '')),
    liveRoot: path.resolve(String(args['live-root'] || '')),
    homepageChartRoot: path.resolve(String(args['homepage-chart-root'] || '')),
    expectedBuildId: buildId,
    sourceSha,
  });
  if (outputPath) {
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
  process.exit(0);
}

fail(`unknown command ${command || '<missing>'}; use inputs or layout`);
