import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PO_CPU_AB_TIMEOUT_MS,
  PO_CPU_AB_SIGNATURE,
  PO_CPU_AB_STATUS_SKIP,
  assertPoCpuAbBenchmarkReport,
  mutatePoCpuAbReplaySystemForPauseTeardownNC,
  poCpuAbHostHtml,
  runPoCpuAbBenchmarkGate,
  runPoCpuAbBenchmarkPreflight,
} from '../lib/po-cpu-ab-benchmark.mjs';
import { parsePoCpuAbBenchmarkArgs } from '../po-cpu-ab-benchmark-gate.mjs';

function phase({
  label,
  workRatio = 0.02,
  durationMs = 3000,
  memoryDelta = 0,
  timerCallbacks = 3,
  longTaskCount = 0,
} = {}) {
  const workMs = workRatio * durationMs;
  return {
    label,
    durationMs,
    observedMs: durationMs,
    callbackBusyMs: workMs,
    longTaskDurationMs: 0,
    workMs,
    workRatio,
    intervalCallbacks: timerCallbacks,
    timeoutCallbacks: 0,
    rafCallbacks: 0,
    timerCallbacks,
    longTaskCount,
    maxCallbackMs: workMs,
    memory: {
      start: { exposed: true, usedJSHeapSize: 100_000_000, totalJSHeapSize: 120_000_000 },
      end: { exposed: true, usedJSHeapSize: 100_000_000 + memoryDelta, totalJSHeapSize: 120_000_000 },
      usedDeltaBytes: memoryDelta,
    },
    probe: { longTaskObserver: true, start: {}, end: {} },
  };
}

function report({
  mutant = false,
  p1WorkRatio = 0.02,
  p2WorkRatio = 0.03,
  p6WorkRatio = 0.18,
  p7WorkRatio = 0.025,
  p2MemoryDelta = 0,
  p6Replay = {},
} = {}) {
  const replayP6 = {
    ok: true,
    requestedSpeed: 10,
    nearestSpeed: 10,
    method: 'setSpeed',
    activeObserved: true,
    playingObserved: true,
    advancedObserved: true,
    state: { isActive: true, isPlaying: true, speed: 10 },
    ...p6Replay,
  };
  return {
    signature: PO_CPU_AB_SIGNATURE,
    ok: true,
    meta: {
      shortened: true,
      mutant,
      timings: { p2IdleMs: 10_000 },
    },
    replay: {
      p4: {
        ok: true,
        panelCount: 4,
        playingCount: 4,
        requestedSpeed: 10,
        rows: ['A', 'B', 'C', 'D'].map((id) => ({ id, ok: true, state: { isPlaying: true, speed: 10 } })),
      },
      p6: replayP6,
      p7: { ok: true, state: { isPlaying: false, speed: 10 } },
    },
    phases: {
      P1: phase({ label: 'P1', workRatio: p1WorkRatio }),
      P2: phase({ label: 'P2', workRatio: p2WorkRatio, memoryDelta: p2MemoryDelta }),
      P4: {
        ...phase({ label: 'P4', workRatio: 0.22, timerCallbacks: 24 }),
        probe: { windowCount: 4, windows: [] },
      },
      P6: phase({ label: 'P6', workRatio: p6WorkRatio, timerCallbacks: 18 }),
      P7: phase({ label: 'P7', workRatio: p7WorkRatio, timerCallbacks: 3 }),
    },
  };
}

test('unit: host HTML records shortened meta for CI P2', () => {
  const html = poCpuAbHostHtml({
    timings: { p2IdleMs: 10_000, shortened: true },
    mutant: false,
  });
  assert.match(html, /P2-idle-soak/);
  assert.match(html, /P4-four-panel-replay-10x-or-nearest/);
  assert.match(html, /"shortened":true/);
  assert.match(html, /PerformanceObserver longtask/);
  assert.match(html, /const workMs = Math\.max\(callbackBusyMs, longTaskDurationMs\)/);
  assert.match(html, /phaseCallbackSamples/);
});

test('unit: oracle accepts P1/P2/P4/P6/P7 report and records replay observables', () => {
  const cells = assertPoCpuAbBenchmarkReport(report());
  assert.equal(cells.every((cell) => cell.pass), true);
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.replay.panelCount, 4);
  assert.equal(p4.probeWindowCount, 4);
  const p6 = cells.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED');
  assert.equal(p6.replay.nearestSpeed, 10);
});

test('fault-injection: P7 spinning interval mutant must go red', () => {
  const cells = assertPoCpuAbBenchmarkReport(report({ mutant: true, p7WorkRatio: 0.8 }), { mutant: true });
  assert.equal(cells.find((cell) => cell.name === 'P7-WORK-RETURNS-TO-P1-FLOOR').status, 'RED');
  assert.equal(cells.find((cell) => cell.name === 'NC-P7-REPLAY-PAUSE-TEARDOWN-MUST-RED').status, 'GREEN');
});

test('fault-injection: P6 cannot green when replay never starts or speed is unknown', () => {
  const neverStarted = assertPoCpuAbBenchmarkReport(report({
    p6WorkRatio: 0.30,
    p6Replay: {
      ok: false,
      nearestSpeed: 10,
      activeObserved: false,
      playingObserved: false,
      state: { isActive: false, isPlaying: false, speed: 10 },
    },
  }));
  assert.equal(neverStarted.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED').status, 'RED');

  const unknownSpeed = assertPoCpuAbBenchmarkReport(report({
    p6WorkRatio: 0.30,
    p6Replay: { nearestSpeed: null },
  }));
  assert.equal(unknownSpeed.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED').status, 'RED');
});

test('fault-injection: high P1 cannot absorb idle and pause ceilings', () => {
  const cells = assertPoCpuAbBenchmarkReport(report({
    p1WorkRatio: 0.70,
    p2WorkRatio: 0.20,
    p7WorkRatio: 0.20,
  }));
  assert.equal(cells.find((cell) => cell.name === 'P1-IDLE-SINGLE-CHART-OBSERVED').status, 'RED');
  assert.equal(cells.find((cell) => cell.name === 'P2-IDLE-STABLE-NO-UNBOUNDED-WORK').status, 'RED');
  assert.equal(cells.find((cell) => cell.name === 'P7-WORK-RETURNS-TO-P1-FLOOR').status, 'RED');
});

test('unit: pause negative control mutates served replay-system pause path', () => {
  const source = `class ReplaySystem {
    pause() {
        this._cancelDeferredPlayStart();
        this.isPlaying = false;
    }
    stop() {
        this.pause();
    }
}`;
  const mutated = mutatePoCpuAbReplaySystemForPauseTeardownNC(source);
  assert.match(mutated, /pause\(\) \{\n        return;\n        this\._cancelDeferredPlayStart\(\);/);
  assert.doesNotMatch(poCpuAbHostHtml({ mutant: true }), /poCpuAbPauseMutant|setInterval\(function poCpuAbPauseMutant/);
  assert.throws(() => mutatePoCpuAbReplaySystemForPauseTeardownNC('class X {}'), /pause\(\) boundary not found/);
});

test('fault-injection: idle memory growth is red when exposed', () => {
  const cells = assertPoCpuAbBenchmarkReport(report({ p2MemoryDelta: 80 * 1024 * 1024 }));
  assert.equal(cells.find((cell) => cell.name === 'P2-IDLE-MEMORY-NOT-GROWING').status, 'RED');
});

test('fault-injection: missing browser skips by default and fails when required', async () => {
  const skipped = await runPoCpuAbBenchmarkGate({ findBrowser: () => null });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.status, PO_CPU_AB_STATUS_SKIP);

  const required = await runPoCpuAbBenchmarkGate({ findBrowser: () => null, requireBrowser: true });
  assert.equal(required.ok, false);
  assert.equal(required.status, 'RED');
});

test('fault-injection: injected browser report validates acceptance path', async () => {
  const result = await runPoCpuAbBenchmarkGate({
    short: true,
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: report(),
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.signature, PO_CPU_AB_SIGNATURE);
  assert.equal(result.status, 'GREEN');
  assert.equal(result.report.meta.shortened, true);
});

test('fault-injection: injected preflight requires mutant P7 red', async () => {
  let calls = 0;
  const preflight = await runPoCpuAbBenchmarkPreflight({
    short: true,
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => {
      calls += 1;
      return {
        report: calls === 2
          ? report({ mutant: true, p7WorkRatio: 0.8 })
          : report(),
        timedOut: false,
        stderrTail: '',
      };
    },
  });

  assert.equal(calls, 2);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.status, 'GREEN');
  assert.equal(preflight.mutant.status, 'RED');
});

test('unit: CLI args expose require-browser and short P2 override', () => {
  const args = parsePoCpuAbBenchmarkArgs(['--require-browser', '--short', '--p2-ms=5000', '--timeout-ms=9000']);
  assert.equal(args.requireBrowser, true);
  assert.equal(args.short, true);
  assert.equal(args.timeoutMs, 9000);
  assert.equal(args.timings.p2IdleMs, 5000);
  assert.equal(args.timings.p2Override, true);
  const p2Only = parsePoCpuAbBenchmarkArgs(['--p2-ms=5000']);
  assert.equal(p2Only.short, false);
  assert.equal(p2Only.timings.p2Override, true);
  assert.throws(() => parsePoCpuAbBenchmarkArgs(['--bogus']), /unknown argument/);
});

test('unit: default full protocol timeout covers unshortened phases', () => {
  assert.ok(DEFAULT_PO_CPU_AB_TIMEOUT_MS >= 600_000);
});
