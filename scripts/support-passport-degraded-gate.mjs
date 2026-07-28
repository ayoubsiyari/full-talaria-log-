#!/usr/bin/env node
/**
 * Preflight CLI — SUPPORT-PASSPORT-DEGRADED-MODULES-V1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatSupportPassportDegradedReport,
  runSupportPassportDegradedGate,
} from './lib/support-passport-degraded.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supportUiPath = path.join(
  root,
  'homepage/src/app/dashboard/support/supportUi.tsx',
);
const supportUiSource = fs.readFileSync(supportUiPath, 'utf8');

const report = runSupportPassportDegradedGate({ supportUiSource });
console.log(formatSupportPassportDegradedReport(report));
if (!report.allPass) process.exitCode = 1;
