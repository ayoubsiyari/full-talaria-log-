import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyM19EHotpathConsoleCall,
  M19_E_HOTPATH_CONSOLE_EXEMPTIONS,
  matchM19EHotpathConsoleExemption,
} from '../lib/m19-e-hotpath-console-exemptions.mjs';

const UNHYDRATED_WARN =
  "📔 durable journal write suppressed: this session's journal was never hydrated from the server; the in-memory journal may be incomplete and writing it would delete server-side trades. Keeping last durable state.";

function countTowardHotpath(level, message) {
  return classifyM19EHotpathConsoleCall(level, [message]).countsTowardHotpath;
}

test('named B-W16 unhydrated durable-write warn is HARNESS_ARTEFACT exempt', () => {
  assert.ok(M19_E_HOTPATH_CONSOLE_EXEMPTIONS.some((row) => row.id === 'B_W16_DURABLE_JOURNAL_UNHYDRATED_HARNESS_ARTEFACT'));
  const hit = matchM19EHotpathConsoleExemption('warn', [UNHYDRATED_WARN]);
  assert.equal(hit?.id, 'B_W16_DURABLE_JOURNAL_UNHYDRATED_HARNESS_ARTEFACT');
  assert.equal(hit?.verdict, 'HARNESS_ARTEFACT');
  assert.equal(countTowardHotpath('warn', UNHYDRATED_WARN), false);
});

test('GATE-01: injected hot-path console.log still counts toward e_hotpathConsole', () => {
  assert.equal(countTowardHotpath('log', 'hotpath tick marker redraw'), true);
  assert.equal(countTowardHotpath('log', UNHYDRATED_WARN), true);
});

test('GATE-01: unlisted console.warn still counts toward e_hotpathConsole', () => {
  assert.equal(countTowardHotpath('warn', '⚠️ Session state not saved: HTTP 500'), true);
  assert.equal(countTowardHotpath('warn', '📔 Trade journal cannot persist: no active trading session'), true);
  assert.equal(countTowardHotpath('error', 'unexpected persist failure'), true);
});

test('exemption does not drop warn/error levels globally', () => {
  // Fifty exempt warns must not imply a warn-level free pass.
  let counted = 0;
  let exempt = 0;
  for (let i = 0; i < 50; i += 1) {
    if (countTowardHotpath('warn', UNHYDRATED_WARN)) counted += 1;
    else exempt += 1;
    if (countTowardHotpath('warn', `unlisted safety noise #${i}`)) counted += 1;
  }
  assert.equal(exempt, 50);
  assert.equal(counted, 50);
});
