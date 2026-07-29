import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH,
  PRODUCT_FILES,
  analyzeTimerOutlivesOwnerSweep,
  assertTimerOutlivesOwnerSweep,
} from './timer-outlives-owner-sweep.mjs';

const REPO_ROOT = path.resolve(process.cwd());

function copyExpectedFiles() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-timer-sweep-'));
  for (const rel of Object.values(PRODUCT_FILES)) {
    const from = path.join(REPO_ROOT, rel);
    const to = path.join(root, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return root;
}

function mutate(root, rel, mutator) {
  const file = path.join(root, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = mutator(before);
  assert.notEqual(after, before, `mutator changed ${rel}`);
  fs.writeFileSync(file, after);
}

function assertRed(root, expectedName) {
  assert.throws(
    () => assertTimerOutlivesOwnerSweep({ root }),
    (err) => {
      assert.match(String(err && err.message), new RegExp(expectedName));
      return true;
    }
  );
}

test('clean tree passes source-reading timer-outlives-owner sweep', () => {
  const analysis = assertTimerOutlivesOwnerSweep({ root: REPO_ROOT });
  assert.ok(analysis.census.length > 0, 'raw start-site census is populated');
  assert.ok(analysis.assertions.every((row) => row.passed), 'all explicit evidence cells pass');
  assert.ok(analysis.assertions.some((row) => row.name === 'indicator-worker-singleton-leak-escalation' && row.verdict === 'DEFECT'));
  assert.ok(analysis.assertions.some((row) => row.name === 'custom-indicator-worker-timeout-cleanup' && row.verdict === 'UNPROVEN'));
});

test('fail-closed: missing expected product file fails loudly', () => {
  const root = copyExpectedFiles();
  fs.unlinkSync(path.join(root, PRODUCT_FILES.multichartGrid));
  assert.throws(
    () => analyzeTimerOutlivesOwnerSweep({ root }),
    /expected readable source file: chart v 1\.4\/talaria-design\/src\/MultichartGrid\.jsx/
  );
});

test('mutation: reintroducing Talaria live WS ping immortality goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.talariaLive, (source) => source.replace(
    /ws\.onclose = \(\) => \{[\s\S]*?supportDisconnectWs\(\);\n      \};/,
    'ws.onclose = () => { if (supportWsRef.current === ws) supportWsRef.current = null; };'
  ));
  assertRed(root, 'talaria-live-support-ws-ping-cleanup');
});

test('mutation: reintroducing V16 WS ping immortality goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.v16SupportChat, (source) => source.replace(
    /ws\.onclose = \(\) => \{[\s\S]*?disconnectWs\(\);\n        \};/,
    'ws.onclose = () => {\n          if (wsRef.current === ws) wsRef.current = null;\n        };'
  ));
  assertRed(root, 'v16-support-ws-ping-cleanup');
});

test('mutation: removing replayAlignGuard cleanup goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.multichartGrid, (source) => source.replace(
    '            clearInterval(replayAlignGuard);\n',
    ''
  ));
  assertRed(root, 'multichart-replay-align-guard-cleanup');
});

test('mutation: reverting host bus retry timer cleanup fix goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.multichartGrid, (source) => source
    .replace(new RegExp(`const MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH = "${MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH}";\\n`), '')
    .replace(/function mcHostBusRetryTimerCleanupV1Enabled\(\) \{[\s\S]*?\n\}\n\n\/\*\* CB-01/, '/** CB-01')
    .replace(
      /if \(hostBusRetryInterval && mcHostBusRetryTimerCleanupV1Enabled\(\)\) \{/,
      'if (mcGridStatePurgeV1Enabled() && hostBusRetryInterval) {'
    ));
  assertRed(root, 'multichart-host-bus-retry-cleanup');
});

test('mutation: welding the host bus switch to the purge switch goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.multichartGrid, (source) => source
    .replace(
      /if \(hostBusRetryInterval && mcHostBusRetryTimerCleanupV1Enabled\(\)\) \{/,
      'if (hostBusRetryInterval\n                && (mcHostBusRetryTimerCleanupV1Enabled() || mcGridStatePurgeV1Enabled())) {'
    ));
  assertRed(root, 'multichart-host-bus-retry-cleanup');
});

test('mutation: removing preferences sync debounce cleanup goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.preferencesSync, (source) => source.replace(
    /        if \(this\.syncTimer\) \{\n            clearTimeout\(this\.syncTimer\);\n            this\.syncTimer = null;\n        \}\n/,
    ''
  ));
  assertRed(root, 'preferences-sync-debounce-cleanup');
});

test('mutation: removing owner watch interval cleanup goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.preferencesSync, (source) => source.replace(
    /    function stopOwnerWatch\(\) \{\n        if \(ownerTimer !== null\) \{\n            clearInterval\(ownerTimer\);\n            ownerTimer = null;\n        \}\n    \}\n/,
    '    function stopOwnerWatch() {\n        ownerTimer = null;\n    }\n'
  ));
  assertRed(root, 'preferences-owner-watch-cleanup');
});

test('mutation: removing indicator-worker leak evidence goes RED', () => {
  const root = copyExpectedFiles();
  mutate(root, PRODUCT_FILES.chartIndicatorsFull, (source) => source.replace(
    "var w = new Worker('/chart/workers/indicator-worker.js');",
    "var w = null;"
  ));
  assertRed(root, 'indicator-worker-singleton-leak-escalation');
});
