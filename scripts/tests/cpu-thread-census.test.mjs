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

test('unit: a thread whose busy time is one window-long slice is a wait, not CPU', () => {
  // GpuVSyncThread blocks on vsync and emits one slice spanning the window.
  // Counting it manufactures ~100% of a core out of an idle browser.
  const events = [
    meta(1, 1, 'CrRendererMain'),
    meta(1, 9, 'GpuVSyncThread'),
    span(1, 1, 0, 2_000),
    span(1, 9, 0, 10_000),
  ];
  const census = summarizeTraceThreadCpu(events, { wallMs: 10 });
  assert.equal(census.totalCpuPercent, 20, 'only the renderer thread should count');
  assert.equal(census.totalPercentIncludingWaits, 120, 'raw coverage is still reported');
  assert.deepEqual(census.waitDominatedThreads.map((t) => t.threadName), ['GpuVSyncThread']);
  assert.equal(census.countedThreadCount, 1);
});

test('unit: a long main-thread task is flagged, not excluded', () => {
  // One 9ms task on CrRendererMain is the long-task pathology; discarding it
  // would hide the worst case this census exists to find.
  const census = summarizeTraceThreadCpu([
    meta(1, 1, 'CrRendererMain'),
    span(1, 1, 0, 9_000),
  ], { wallMs: 10 });
  assert.equal(census.mainThreadPercent, 90);
  assert.equal(census.waitDominatedThreads.length, 0);
  assert.equal(census.threads[0].singleRunSpansWindow, true);
});

test('unit: a busy thread with many short slices is never treated as a wait', () => {
  const events = [meta(1, 2, 'Compositor')];
  // 50 slices of 100us across a 10ms window: 50% busy, longest run well short.
  for (let i = 0; i < 50; i += 1) events.push(span(1, 2, i * 200, 100));
  const census = summarizeTraceThreadCpu(events, { wallMs: 10 });
  assert.equal(census.waitDominatedThreads.length, 0);
  assert.equal(census.totalCpuPercent, 50);
});

test('unit: a named wait thread is excluded even when its slices are short', () => {
  const events = [
    meta(1, 1, 'CrRendererMain'),
    meta(1, 7, 'GpuVSyncThread'),
    span(1, 1, 0, 5_000),
    span(1, 7, 0, 100),
    span(1, 7, 500, 100),
  ];
  const census = summarizeTraceThreadCpu(events, { wallMs: 10 });
  assert.equal(census.totalCpuPercent, 50);
  assert.equal(census.waitDominatedThreads.length, 1);
});

test('unit: self time credits the child, not the wrapper that contains it', () => {
  // RunTask 0-1000 containing FunctionCall 100-900: the wrapper owns 200us.
  const census = summarizeTraceThreadCpu([
    meta(1, 1, 'CrRendererMain'),
    span(1, 1, 0, 1_000, 'RunTask'),
    span(1, 1, 100, 800, 'FunctionCall'),
  ], { wallMs: 1 });
  const top = census.threads[0].topEvents;
  assert.deepEqual(top.map((r) => [r.name, r.selfMs]), [['FunctionCall', 0.8], ['RunTask', 0.2]]);
  // Busy time is still the union of the outer interval, not the sum.
  assert.equal(census.threads[0].busyMs, 1);
});

test('unit: sibling events each keep their own self time', () => {
  const census = summarizeTraceThreadCpu([
    meta(1, 1, 'Compositor'),
    span(1, 1, 0, 1_000, 'RunTask'),
    span(1, 1, 0, 400, 'RasterTask'),
    span(1, 1, 500, 300, 'RasterTask'),
  ], { wallMs: 1 });
  const byName = new Map(census.threads[0].topEvents.map((r) => [r.name, r]));
  assert.equal(byName.get('RasterTask').selfMs, 0.7);
  assert.equal(byName.get('RasterTask').count, 2);
  assert.equal(byName.get('RunTask').selfMs, 0.3);
});

test('unit: partially overlapping events are not treated as nested', () => {
  // 0-1000 and 500-1500 overlap without containment; neither is debited.
  const census = summarizeTraceThreadCpu([
    meta(1, 1, 'CrGpuMain'),
    span(1, 1, 0, 1_000, 'A'),
    span(1, 1, 500, 1_000, 'B'),
  ], { wallMs: 2 });
  const byName = new Map(census.threads[0].topEvents.map((r) => [r.name, r]));
  assert.equal(byName.get('A').selfMs, 1);
  assert.equal(byName.get('B').selfMs, 1);
  assert.equal(census.threads[0].busyMs, 1.5, 'union coverage is still 1.5ms');
});
