#!/usr/bin/env node
/**
 * Preflight CLI — SUPPORT-PASSPORT-DEGRADED-MODULES-V1
 *
 * Executes the real `buildSupportContext()` from supportUi.tsx against the real
 * module-presence runtime. `--out <file>` writes the evidence JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  API_SERVER_RELATIVE_PATH,
  INDICATOR_PERFORMANCE_RELATIVE_PATH,
  MODULE_PRESENCE_RUNTIME_RELATIVE_PATH,
  SUPPORT_PASSPORT_CONSUMERS,
  SUPPORT_UI_RELATIVE_PATH,
  formatSupportPassportDegradedReport,
  resolveTypeScript,
  runSupportPassportDegradedGate,
} from './lib/support-passport-degraded.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const readOptional = (relative) => {
  try {
    return read(relative);
  } catch {
    return null;
  }
};

// Read-only: the consumer .tsx files are pinned from here, never edited by this gate.
const consumerSources = Object.fromEntries(
  SUPPORT_PASSPORT_CONSUMERS
    .map((consumer) => [consumer.relativePath, readOptional(consumer.relativePath)])
    .filter(([, source]) => source !== null),
);

const report = runSupportPassportDegradedGate({
  supportUiSource: read(SUPPORT_UI_RELATIVE_PATH),
  runtimeSource: read(MODULE_PRESENCE_RUNTIME_RELATIVE_PATH),
  indicatorPerfSource: read(INDICATOR_PERFORMANCE_RELATIVE_PATH),
  consumerSources,
  apiServerSource: readOptional(API_SERVER_RELATIVE_PATH),
  typescript: resolveTypeScript(root),
});

console.log(formatSupportPassportDegradedReport(report));

const outIndex = process.argv.indexOf('--out');
if (outIndex !== -1 && process.argv[outIndex + 1]) {
  fs.writeFileSync(process.argv[outIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
}

if (!report.allPass) process.exitCode = 1;
