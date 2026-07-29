import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessCpuCeiling,
  summarizeTraceThreadCpu,
} from '../lib/cpu-thread-census.mjs';

const meta = (pid, tid, name) => ({
  ph: 'M', pid, tid, name: 'thread_name', args: { name },
});
const span = (pid, tid, ts, dur, name = 'Task') => ({ ph: 'X', pid, tid, ts, dur, name });

test('unit: nested events are not double counted (would fake >100%)', () => {
  // A 10ms parent containing two children fully inside it is 10ms of CPU, not 20ms.
  const events = [
    meta(1, 1, 'CrRendererMain'),
    span(1, 1, 0, 10_000, 'RunTask'),
    span(1, 1, 1_000, 4_000, 'FunctionCall'),
    span(1, 1, 5_000, 4_000, 'FunctionCall'),
  ];
  const census = summarizeTraceThreadCpu(events, { wallMs: 100 });
  assert.equal(census.totalBusyMs, 10);
  assert.equal(census.mainThreadPercent, 10);
});

test('unit: disjoint events on one thread sum', () => {
  const events = [
    meta(1, 1, 'CrRendererMain'),
    span(1, 1, 0, 5_000),
    span(1, 1, 10_000, 5_000),
  ];
  const census = summarizeTraceThreadCpu(events, { wallMs: 100 });
  assert.equal(census.totalBusyMs, 10);
});

test('unit: partially overlapping events count the union only', () => {
  const events = [
    meta(1, 1, 'CrRendererMain'),
    span(1, 1, 0, 10_000),
    span(1, 1, 5_000, 10_000),
  ];
  const census = summarizeTraceThreadCpu(events, { wallMs: 100 });
  assert.equal(census.totalBusyMs, 15);
});

test('unit: multi-thread total may exceed one core', () => {
  // Main 80ms + compositor 40ms over 100ms wall = 120% of a core.
  const events = [
    meta(1, 1, 'CrRendererMain'),
    meta(1, 2, 'Compositor'),
    span(1, 1, 0, 80_000),
    span(1, 2, 0, 40_000),
  ];
  const census = summarizeTraceThreadCpu(events, { wallMs: 100 });
  assert.equal(census.totalCpuPercent, 120);
  assert.equal(census.mainThreadPercent, 80);
  assert.equal(census.threadCount, 2);
  assert.equal(census.threads[0].threadName, 'CrRendererMain');
});

test('unit: ceiling assessment separates off-main-thread cost', () => {
  const census = summarizeTraceThreadCpu([
    meta(1, 1, 'CrRendererMain'),
    meta(1, 2, 'Compositor'),
    span(1, 1, 0, 70_000),
    span(1, 2, 0, 45_000),
  ], { wallMs: 100 });
  const got = assessCpuCeiling(census, { claimedPercent: 111 });
  assert.equal(got.measuredPercent, 115);
  assert.equal(got.mainThreadPercent, 70);
  assert.equal(got.offCoreThreadPercent, 45);
  assert.equal(got.exceedsOneCore, true);
  assert.equal(got.reproducesCeiling, true);
  assert.equal(got.verdict, 'CEILING-REPRODUCED-MULTITHREAD');
});

test('unit: a main-thread-only probe far below the claim is BELOW-CLAIM, not a refutation', () => {
  const census = summarizeTraceThreadCpu([
    meta(1, 1, 'CrRendererMain'),
    span(1, 1, 0, 7_000),
  ], { wallMs: 100 });
  const got = assessCpuCeiling(census, { claimedPercent: 111 });
  assert.equal(got.verdict, 'BELOW-CLAIM');
  assert.equal(got.reproducesCeiling, false);
  assert.match(got.note, /does not reproduce/);
});

test('unit: instant and async events carry no duration and are ignored', () => {
  const events = [
    meta(1, 1, 'CrRendererMain'),
    { ph: 'I', pid: 1, tid: 1, ts: 0, name: 'Mark' },
    { ph: 'b', pid: 1, tid: 1, ts: 0, name: 'AsyncStart' },
    span(1, 1, 0, 5_000),
  ];
  const census = summarizeTraceThreadCpu(events, { wallMs: 100 });
  assert.equal(census.totalBusyMs, 5);
});

test('unit: empty trace yields no-data verdict rather than 0% pass', () => {
  const census = summarizeTraceThreadCpu([], {});
  assert.equal(census.totalCpuPercent, null);
  assert.equal(assessCpuCeiling(census).verdict, 'NO-DATA');
});

test('unit: wall time defaults to the trace span when not supplied', () => {
  const census = summarizeTraceThreadCpu([
    meta(1, 1, 'CrRendererMain'),
    span(1, 1, 1_000_000, 500_000),
  ]);
  assert.equal(census.traceSpanMs, 500);
  assert.equal(census.mainThreadPercent, 100);
});
