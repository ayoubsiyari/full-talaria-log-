/**
 * gate.mjs — merge gate wrapper for the Phase-4 multichart harness.
 *
 * The raw harness intentionally exits non-zero while known real engine defects
 * remain. This wrapper ratchets that state: only the tracked failures may stay
 * red, newly green tracked failures must be removed from known-failing.json, and
 * scenario ID drift must update the baseline deliberately.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarioList } from './scenarios.mjs';

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
  const expectedTests = Array.isArray(parsed.expectedTests) ? parsed.expectedTests : [];
  const knownFailing = parsed.knownFailing && typeof parsed.knownFailing === 'object'
    ? parsed.knownFailing
    : {};
  return { expectedTests, knownFailing };
}

function extraHarnessArgs() {
  const raw = String(process.env.TALARIA_GATE_RUN_ARGS || '').trim();
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

function runHarnessOnce() {
  return new Promise((resolve) => {
    const args = ['run.mjs', ...extraHarnessArgs()];
    if (args.length > 1) {
      console.log(`[gate] extra harness args: ${args.slice(1).join(' ')}`);
    }
    const child = spawn(process.execPath, args, {
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

function printGateSummary({ expectedTests, actualTests, knownFailIds, results, regressions, knownStillFailing, newlyFixed, missingResults, unexpectedResults }) {
  console.log('\n================= GATE SUMMARY =================');
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
    console.log(`GATE ${id} ${results.get(id) || 'MISSING'}${knownFailIds.includes(id) ? ' (known-failing)' : ''}`);
  }
}

async function main() {
  const { expectedTests, knownFailing } = await loadBaseline();
  const knownFailIds = Object.keys(knownFailing).sort();
  const actualTests = scenarioList().map((s) => s.id);
  const expectedSorted = [...expectedTests].sort();
  const actualSorted = [...actualTests].sort();

  const baselineKnownOutsideExpected = knownFailIds.filter((id) => !expectedTests.includes(id));
  if (baselineKnownOutsideExpected.length) {
    console.error(`[gate] known-failing contains IDs outside expectedTests: ${baselineKnownOutsideExpected.join(', ')}`);
    process.exit(1);
  }

  if (!sameSet(expectedSorted, actualSorted)) {
    console.error('[gate] scenario ID set changed; update known-failing.json expectedTests deliberately.');
    console.error(`[gate] expected: ${expectedSorted.join(', ')}`);
    console.error(`[gate] actual:   ${actualSorted.join(', ')}`);
    process.exit(1);
  }

  const run = await runHarnessOnce();
  const results = parseResults(run.output);
  const resultIds = [...results.keys()].sort();
  const missingResults = expectedSorted.filter((id) => !results.has(id));
  const unexpectedResults = resultIds.filter((id) => !expectedTests.includes(id));
  const regressions = expectedTests.filter((id) => !knownFailIds.includes(id) && results.get(id) === 'FAIL');
  const knownStillFailing = expectedTests.filter((id) => knownFailIds.includes(id) && results.get(id) === 'FAIL');
  const newlyFixed = expectedTests.filter((id) => knownFailIds.includes(id) && results.get(id) === 'PASS');

  printGateSummary({
    expectedTests,
    actualTests,
    knownFailIds,
    results,
    regressions,
    knownStillFailing,
    newlyFixed,
    missingResults,
    unexpectedResults,
  });

  if (missingResults.length || unexpectedResults.length) {
    console.error('[gate] RESULT set changed; update known-failing.json expectedTests deliberately.');
    process.exit(1);
  }
  if (regressions.length) {
    console.error(`[gate] FAIL: regression(s): ${regressions.join(', ')}`);
    process.exit(1);
  }
  if (newlyFixed.length) {
    console.error(`[gate] FAIL: baseline stale; remove fixed test(s) from known-failing.json: ${newlyFixed.join(', ')}`);
    process.exit(1);
  }
  if (run.code !== 0 && knownStillFailing.length !== knownFailIds.length) {
    console.error(`[gate] FAIL: raw harness exited ${run.code}, but failures did not match baseline.`);
    process.exit(1);
  }

  console.log(`[gate] PASS: no new regressions; ${knownStillFailing.length} known-failing tracked.`);
}

main().catch((err) => {
  console.error('[gate] FATAL:', (err && err.stack) || err);
  process.exit(1);
});
