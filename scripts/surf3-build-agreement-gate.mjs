#!/usr/bin/env node
/**
 * SURF-3 — V9 chart shell build-agreement gate.
 *
 * Fetches every configured shell URL, extracts window.__TALARIA_CHART_BUILD_ID,
 * and FAILs unless all stamps are present and identical.
 *
 *   node scripts/surf3-build-agreement-gate.mjs
 *   node scripts/surf3-build-agreement-gate.mjs --fixture
 *   node scripts/surf3-build-agreement-gate.mjs --base-url=http://host:3000
 *   node scripts/surf3-build-agreement-gate.mjs --cookie="$LIVE_PROBE_COOKIE"
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SURF3_BUILD_AGREEMENT_SIGNATURE,
  SURF3_DEFAULT_BASE_URL,
  defaultSurf3Gate01FixtureDir,
  formatSurf3BuildAgreementReport,
  runSurf3BuildAgreementGate,
} from './lib/surf3-build-agreement.mjs';

export function parseSurf3BuildAgreementArgs(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: process.env.SURF3_BASE_URL || SURF3_DEFAULT_BASE_URL,
    fixtureDir: null,
    cookie: process.env.LIVE_PROBE_COOKIE || process.env.SURF3_COOKIE || null,
    timeoutMs: 20_000,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--fixture' || arg === '--gate01-fixture') {
      options.fixtureDir = defaultSurf3Gate01FixtureDir();
    } else if (arg.startsWith('--fixture-dir=')) {
      options.fixtureDir = path.resolve(arg.slice('--fixture-dir='.length));
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg.startsWith('--cookie=')) {
      options.cookie = arg.slice('--cookie='.length);
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('invalid --timeout-ms');
  }
  return options;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  let report;
  let wantJson = false;
  try {
    const options = parseSurf3BuildAgreementArgs();
    wantJson = options.json === true;
    report = await runSurf3BuildAgreementGate(options);
  } catch (error) {
    report = {
      ok: false,
      status: 'RED',
      signature: SURF3_BUILD_AGREEMENT_SIGNATURE,
      error: String(error?.message || error),
      cells: [],
      observations: [],
    };
    wantJson = process.argv.includes('--json');
  }
  if (wantJson) console.log(JSON.stringify(report, null, 2));
  else console.log(formatSurf3BuildAgreementReport(report));
  process.exit(report.ok ? 0 : 1);
}
