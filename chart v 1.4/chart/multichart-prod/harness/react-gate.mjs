/**
 * react-gate.mjs — merge gate for production-React parity scenarios (T0 step 8).
 *
 * Reads reactParity.expectedTests / reactParity.knownFailing from known-failing.json.
 * The manager harness gate (gate.mjs) is unchanged — I9 preserved.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reactScenarioList } from './react-parity-scenarios.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, 'known-failing.json');

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function formatList(items) {
  return items.length ? items.join(', ') : '(none)';
}

async function loadBaseline() {
  const raw = await fs.readFile(BASELINE_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const reactParity = parsed.reactParity && typeof parsed.reactParity === 'object'
    ? parsed.reactParity
    : { expectedTests: [], knownFailing: {} };
  const expectedTests = Array.isArray(reactParity.expectedTests) ? reactParity.expectedTests : [];
  const knownFailing = reactParity.knownFailing && typeof reactParity.knownFailing === 'object'
    ? reactParity.knownFailing
    : {};
  return { expectedTests, knownFailing };
}

function runReactHarnessOnce() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['react-run.mjs'], {
      cwd: __dirname,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const collect = (chunk, stream) => {
      const text = chunk.toString();
      output += text;
      stream.write(text);
    };
    child.stdout.on('data', (chunk) => collect(chunk, process.stdout));
    child.stderr.on('data', (chunk) => collect(chunk, process.stderr));
    child.on('close', (code) => resolve({ code, output }));
  });
}

function parseResults(output) {
  const results = new Map();
  const re = /^RESULT\s+(\S+)\s+(PASS|FAIL)\s*$/gm;
  let match;
  while ((match = re.exec(output)) !== null) {
    results.set(match[1], match[2]);
  }
  return results;
}

async function main() {
  const { expectedTests, knownFailing } = await loadBaseline();
  const knownFailIds = Object.keys(knownFailing).sort();
  const actualTests = reactScenarioList().map((s) => s.id);
  const expectedSorted = [...expectedTests].sort();
  const actualSorted = [...actualTests].sort();

  const baselineKnownOutsideExpected = knownFailIds.filter((id) => !expectedTests.includes(id));
  if (baselineKnownOutsideExpected.length) {
    console.error(`[react-gate] known-failing contains IDs outside reactParity.expectedTests: ${baselineKnownOutsideExpected.join(', ')}`);
    process.exit(1);
  }

  if (!sameSet(expectedSorted, actualSorted)) {
    console.error('[react-gate] scenario ID set changed; update known-failing.json reactParity.expectedTests deliberately.');
    console.error(`[react-gate] expected: ${expectedSorted.join(', ')}`);
    console.error(`[react-gate] actual:   ${actualSorted.join(', ')}`);
    process.exit(1);
  }

  const run = await runReactHarnessOnce();
  const results = parseResults(run.output);
  const resultIds = [...results.keys()].sort();
  const missingResults = expectedSorted.filter((id) => !results.has(id));
  const unexpectedResults = resultIds.filter((id) => !expectedTests.includes(id));
  const regressions = expectedTests.filter((id) => !knownFailIds.includes(id) && results.get(id) === 'FAIL');
  const knownStillFailing = expectedTests.filter((id) => knownFailIds.includes(id) && results.get(id) === 'FAIL');
  const newlyFixed = expectedTests.filter((id) => knownFailIds.includes(id) && results.get(id) === 'PASS');

  console.log('\n================= REACT GATE SUMMARY =================');
  console.log(`Expected tests: ${expectedTests.join(', ')}`);
  console.log(`Harness tests:  ${actualTests.join(', ')}`);
  console.log(`Known failing baseline: ${formatList(knownFailIds)}`);
  console.log(`Known-failing still red: ${formatList(knownStillFailing)}`);
  console.log(`Regressions (not in baseline but failed): ${formatList(regressions)}`);
  console.log(`Newly fixed (remove from known-failing): ${formatList(newlyFixed)}`);
  if (missingResults.length || unexpectedResults.length) {
    console.log(`Missing RESULT lines: ${formatList(missingResults)}`);
    console.log(`Unexpected RESULT lines: ${formatList(unexpectedResults)}`);
  }
  for (const id of expectedTests) {
    console.log(`REACT-GATE ${id} ${results.get(id) || 'MISSING'}${knownFailIds.includes(id) ? ' (known-failing)' : ''}`);
  }

  if (missingResults.length || unexpectedResults.length) {
    console.error('[react-gate] RESULT set changed; update reactParity.expectedTests deliberately.');
    process.exit(1);
  }
  if (regressions.length) {
    console.error(`[react-gate] FAIL: regression(s): ${regressions.join(', ')}`);
    process.exit(1);
  }
  if (newlyFixed.length) {
    console.error(`[react-gate] FAIL: baseline stale; remove fixed test(s) from reactParity.knownFailing: ${newlyFixed.join(', ')}`);
    process.exit(1);
  }
  if (run.code !== 0 && knownStillFailing.length !== knownFailIds.length) {
    console.error(`[react-gate] FAIL: raw harness exited ${run.code}, but failures did not match baseline.`);
    process.exit(1);
  }

  console.log(`[react-gate] PASS: no new regressions; ${knownStillFailing.length} known-failing tracked.`);
}

main().catch((err) => {
  console.error('[react-gate] FATAL:', (err && err.stack) || err);
  process.exit(1);
});
