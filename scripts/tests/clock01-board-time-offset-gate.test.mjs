import test from 'node:test';
import assert from 'node:assert/strict';

import { scanClock01Text } from '../clock01-board-time-offset-gate.mjs';

test('flags bare HH:MM wall-clock mentions', () => {
  const findings = scanClock01Text('- 13:00+01:00 · D · text says C ran 12:04 and 12:27.', 'BOARD-D.md');
  assert.deepEqual(findings.map((f) => f.token), ['12:04', '12:27']);
});

test('accepts offset-bound and Z-bound wall-clock mentions', () => {
  const findings = scanClock01Text([
    '- 13:00+01:00 · D · row prefix carries its own offset.',
    'Compare `10:03:58Z / 11:03:58+01:00` before calling sequence impossible.',
    'ISO form `2026-08-03T12:04:00+01:00` is bound.',
  ].join('\n'));
  assert.deepEqual(findings, []);
});

test('does not flag durations, rates, ports, or source line references', () => {
  const findings = scanClock01Text([
    'The runner timed out after 150s and then waited 45 minutes.',
    'Host delivered 10 bars/s and the 30-90 s window is a duration range.',
    'Local harness `http://127.0.0.1:8795` is not a clock.',
    'Code at `replay-system.js:5705` is a line reference, not time.',
  ].join('\n'));
  assert.deepEqual(findings, []);
});
