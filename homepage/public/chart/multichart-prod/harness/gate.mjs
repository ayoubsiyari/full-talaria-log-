/**
 * gate.mjs — merge gate wrapper for the Phase-4 multichart harness.
 *
 * The raw harness intentionally exits non-zero while known real engine defects
 * remain. This wrapper ratchets that state: only the tracked failures may stay
 * red, newly green tracked failures must be removed from known-failing.json,
 * quarantine rows are ratchet-neutral (either outcome tolerated, D-027), and
 * scenario ID drift must update the baseline deliberately.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarioList } from './scenarios.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, 'known-failing.json');
const QUARANTINE_LOG_PATH = path.join(__dirname, 'quarantine-outcomes.jsonl');
const MAX_QUARANTINE_ROWS = 5;

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
  const quarantine = parsed.quarantine && typeof parsed.quarantine === 'object'
    ? parsed.quarantine
    : {};
  return { expectedTests, knownFailing, quarantine };
}

async function appendQuarantineLog(buildId, outcomes) {
  const line = `${JSON.stringify({
    at: new Date().toISOString(),
    buildId: buildId || 'unknown',
    outcomes,
  })}\n`;
  await fs.appendFile(QUARANTINE_LOG_PATH, line, 'utf8');
}

async function readServeBuildId() {
  try {
    const serve = await fs.readFile(path.join(__dirname, 'serve.mjs'), 'utf8');
    const m = serve.match(/const buildId = '([^']+)'/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
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

function printGateSummary({
  expectedTests, actualTests, knownFailIds, quarantineIds, results,
  regressions, knownStillFailing, newlyFixed, quarantineOutcomes,
  missingResults, unexpectedResults,
}) {
  console.log('\n================= GATE SUMMARY =================');
  console.log(`Expected tests: ${expectedTests.join(', ')}`);
  console.log(`Harness tests:  ${actualTests.join(', ')}`);
  console.log(`Known failing baseline: ${formatList(knownFailIds)}`);
  console.log(`Quarantine baseline (D-027): ${formatList(quarantineIds)}`);
  console.log(`Known-failing still red: ${formatList(knownStillFailing)}`);
  console.log(`Quarantine outcomes (ratchet-neutral): ${quarantineOutcomes.map((o) => `${o.id}=${o.result}`).join(', ') || '(none)'}`);
  console.log(`Regressions (not in baseline but failed): ${formatList(regressions)}`);
  console.log(`Newly fixed (remove from known-failing): ${formatList(newlyFixed)}`);
  if (missingResults.length || unexpectedResults.length) {
    console.log(`Missing RESULT lines: ${formatList(missingResults)}`);
    console.log(`Unexpected RESULT lines: ${formatList(unexpectedResults)}`);
  }
  for (const id of expectedTests) {
    let tag = '';
    if (knownFailIds.includes(id)) tag = ' (known-failing)';
    else if (quarantineIds.includes(id)) tag = ' (quarantine)';
    console.log(`GATE ${id} ${results.get(id) || 'MISSING'}${tag}`);
  }
}

async function main() {
  const { expectedTests, knownFailing, quarantine } = await loadBaseline();
  const knownFailIds = Object.keys(knownFailing).sort();
  const quarantineIds = Object.keys(quarantine).sort();
  const actualTests = scenarioList().map((s) => s.id);
  const expectedSorted = [...expectedTests].sort();
  const actualSorted = [...actualTests].sort();

  const overlap = knownFailIds.filter((id) => quarantineIds.includes(id));
  if (overlap.length) {
    console.error(`[gate] row(s) in both knownFailing and quarantine: ${overlap.join(', ')}`);
    process.exit(1);
  }

  if (quarantineIds.length > MAX_QUARANTINE_ROWS) {
    console.error(`[gate] FAIL: quarantine bucket has ${quarantineIds.length} rows (max ${MAX_QUARANTINE_ROWS}) — Director escalation required (D-027)`);
    process.exit(1);
  }

  const baselineKnownOutsideExpected = knownFailIds.filter((id) => !expectedTests.includes(id));
  if (baselineKnownOutsideExpected.length) {
    console.error(`[gate] known-failing contains IDs outside expectedTests: ${baselineKnownOutsideExpected.join(', ')}`);
    process.exit(1);
  }

  const quarantineOutsideExpected = quarantineIds.filter((id) => !expectedTests.includes(id));
  if (quarantineOutsideExpected.length) {
    console.error(`[gate] quarantine contains IDs outside expectedTests: ${quarantineOutsideExpected.join(', ')}`);
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
  const regressions = expectedTests.filter((id) => !knownFailIds.includes(id)
    && !quarantineIds.includes(id)
    && results.get(id) === 'FAIL');
  const knownStillFailing = expectedTests.filter((id) => knownFailIds.includes(id) && results.get(id) === 'FAIL');
  const newlyFixed = expectedTests.filter((id) => knownFailIds.includes(id) && results.get(id) === 'PASS');
  const quarantineOutcomes = quarantineIds.map((id) => ({
    id,
    result: results.get(id) || 'MISSING',
  }));

  const quarantineLog = {};
  for (const o of quarantineOutcomes) quarantineLog[o.id] = o.result;
  const buildId = process.env.BUILD_ID || await readServeBuildId();
  await appendQuarantineLog(buildId, quarantineLog).catch((err) => {
    console.error('[gate] warn: could not append quarantine-outcomes.jsonl:', err.message);
  });

  printGateSummary({
    expectedTests,
    actualTests,
    knownFailIds,
    quarantineIds,
    results,
    regressions,
    knownStillFailing,
    newlyFixed,
    quarantineOutcomes,
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
  const knownNotFailing = knownFailIds.filter((id) => results.get(id) !== 'FAIL');
  if (knownNotFailing.length) {
    console.error(`[gate] FAIL: known-failing expected FAIL but passed: ${knownNotFailing.join(', ')}`);
    process.exit(1);
  }

  console.log(`[gate] PASS: 0 unexpected regressions; ${knownStillFailing.length} known-failing tracked; ${quarantineIds.length} quarantine tolerated (log: quarantine-outcomes.jsonl).`);
}

main().catch((err) => {
  console.error('[gate] FATAL:', (err && err.stack) || err);
  process.exit(1);
});
