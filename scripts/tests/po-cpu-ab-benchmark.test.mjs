import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  DEFAULT_PO_CPU_AB_TIMEOUT_MS,
  PO_CPU_AB_SIGNATURE,
  PO_CPU_AB_STATUS_SKIP,
  PO_CPU_AB_STATUS_SHORT,
  assertPoCpuAbBenchmarkReport,
  mutatePoCpuAbReplaySystemForPauseTeardownNC,
  poCpuAbReplayArmingHelpersSource,
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
  p4Replay = {},
  p6Replay = {},
  p7Replay = {},
  shortened = false,
} = {}) {
  const replayP6 = {
    ok: true,
    requestedSpeed: 10,
    nearestSpeed: 10,
    method: 'setSpeed',
    activeObserved: true,
    playingObserved: true,
    advancedObserved: true,
    indexDelta: 5,
    timestampDelta: 300_000,
    beforeState: { isActive: true, isPlaying: false, currentIndex: 10, currentTimestamp: 1_000_000, currentTimestampSource: 'replayTimestamp', speed: 10 },
    state: { isActive: true, isPlaying: true, currentIndex: 15, currentTimestamp: 1_300_000, currentTimestampSource: 'replayTimestamp', speed: 10 },
    ...p6Replay,
  };
  return {
    signature: PO_CPU_AB_SIGNATURE,
    ok: true,
    meta: {
      shortened,
      mutant,
      timings: { p2IdleMs: shortened ? 10_000 : 120_000, shortened },
    },
    replay: {
      p4: {
        ok: true,
        panelCount: 4,
        playingCount: 4,
        advancedCount: 4,
        requestedSpeed: 10,
        armingFailure: null,
        topology: {
          gridPresent: true,
          gridHasGetPanelIds: true,
          gridIds: ['A', 'B', 'C', 'D'],
          gridMissingIds: [],
          gridComplete: true,
          managerIds: ['A', 'B', 'C', 'D'],
          managerComplete: true,
          managerGridConsistent: true,
          windowIds: ['A', 'B', 'C', 'D'],
          windowComplete: true,
          selfConsistent: true,
        },
        rows: ['A', 'B', 'C', 'D'].map((id) => ({
          id,
          ok: true,
          activeObserved: true,
          playingObserved: true,
          advancedObserved: true,
          indexDelta: 5,
          timestampDelta: 300_000,
          advanceContradiction: false,
          beforeState: { isActive: true, isPlaying: false, currentIndex: 10, currentTimestamp: 1_000_000, currentTimestampSource: 'replayTimestamp', speed: 10 },
          state: { isActive: true, isPlaying: true, currentIndex: 15, currentTimestamp: 1_300_000, currentTimestampSource: 'replayTimestamp', speed: 10 },
        })),
        ...p4Replay,
      },
      p6: replayP6,
      p7: { ok: true, state: { isPlaying: false, speed: 10 }, ...p7Replay },
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
  assert.match(html, /_m20Q6LifecycleState/);
  assert.match(html, /advancedCount/);
  assert.match(html, /rs\.replayTimestamp != null/);
  assert.match(html, /currentTimestampSource/);
  assert.match(html, /host-replayPlay-fanout/);
  assert.match(html, /observedAfterP4Window/);
});

test('unit: host HTML arms replay from settled fullRawData replayTimestamp baselines', () => {
  const html = poCpuAbHostHtml();
  assert.match(html, /waitForReplayTimestampBaselineForChart/);
  assert.match(html, /state\.currentTimestampSource === 'replayTimestamp'/);
  assert.match(html, /Array\.isArray\(rs\.fullRawData\)/);
  assert.doesNotMatch(html, /Array\.isArray\(ch\.data\) && ch\.data\.length > 50/);
  assert.match(html, /for \(const entry of chartWindows\(\)\)/);
  assert.doesNotMatch(html, /Promise\.all\(chartWindows\(\)\.map/);
});

test('unit: oracle accepts P1/P2/P4/P6/P7 report and records replay observables', () => {
  const cells = assertPoCpuAbBenchmarkReport(report());
  assert.equal(cells.every((cell) => cell.pass), true);
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.replay.panelCount, 4);
  assert.equal(p4.probeWindowCount, 4);
  assert.equal(p4.advancedCount, 4);
  assert.equal(p4.topologyOk, true);
  const p6 = cells.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED');
  assert.equal(p6.replay.nearestSpeed, 10);
});

test('unit: P4 accepts product passive peers only with sustained forward advance', () => {
  const passiveRows = ['A', 'B', 'C', 'D'].map((id) => ({
    id,
    ok: true,
    activeObserved: true,
    playingObserved: true,
    advancedObserved: true,
    indexDelta: 5,
    timestampDelta: 300_000,
    advanceContradiction: false,
    beforeState: { isActive: true, isPlaying: false, currentIndex: 10, currentTimestamp: 1_000_000, currentTimestampSource: 'replayTimestamp', speed: 10 },
    state: {
      isActive: true,
      isPlaying: true,
      rawIsPlaying: id === 'A',
      passivePlayActive: id !== 'A',
      currentIndex: 15,
      currentTimestamp: 1_300_000,
      currentTimestampSource: 'replayTimestamp',
      speed: 10,
    },
  }));
  const cells = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: true,
      productPlayProtocol: 'host-replayPlay-fanout',
      observedAfterP4Window: true,
      rows: passiveRows,
    },
  }));
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'GREEN');
  assert.equal(p4.playingCount, 4);
  assert.equal(p4.advancedCount, 4);

  passiveRows[2] = {
    ...passiveRows[2],
    advancedObserved: false,
    indexDelta: 0,
    timestampDelta: 0,
    state: { ...passiveRows[2].state, currentIndex: 10, currentTimestamp: 1_000_000 },
  };
  const red = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: false,
      playingCount: 4,
      advancedCount: 3,
      armingFailure: 'not every panel advanced by forward replay timestamp',
      rows: passiveRows,
    },
  })).find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(red.status, 'RED');
  assert.equal(red.playingCount, 4);
  assert.equal(red.advancedCount, 3);
});

test('fault-injection: P4 cannot green on playing flags without four advancing panels', () => {
  const rows = ['A', 'B', 'C', 'D'].map((id, index) => ({
    id,
    ok: index < 2,
    activeObserved: true,
    playingObserved: true,
    advancedObserved: index < 2,
    indexDelta: index < 2 ? 4 : 0,
    timestampDelta: index < 2 ? 240_000 : 0,
    state: { isActive: true, isPlaying: true, speed: 10 },
  }));
  const cells = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: false,
      panelCount: 4,
      playingCount: 4,
      advancedCount: 2,
      armingFailure: 'four-panel replay did not arm and advance on every panel',
      rows,
    },
  }));
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'RED');
  assert.equal(p4.advancedCount, 2);
  assert.match(p4.detail, /four-panel replay did not arm/);
});

test('fault-injection: P4 requires panel count, playing count, and probes', () => {
  const threePlaying = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: false,
      panelCount: 4,
      playingCount: 3,
      advancedCount: 4,
      armingFailure: 'panel C did not keep playing',
      rows: ['A', 'B', 'C', 'D'].map((id, index) => ({
        id,
        ok: true,
        activeObserved: true,
        playingObserved: index !== 2,
        advancedObserved: true,
        indexDelta: 5,
        timestampDelta: 300_000,
        advanceContradiction: false,
        state: { isActive: true, isPlaying: index !== 2, speed: 10 },
      })),
    },
  }));
  assert.equal(threePlaying.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED').status, 'RED');

  const staleTopology = report({
    p4Replay: {
      ok: false,
      panelCount: 3,
      playingCount: 3,
      advancedCount: 3,
      armingFailure: 'topology did not expose four panels',
      topology: {
        gridPresent: true,
        gridHasGetPanelIds: true,
        gridIds: ['A', 'B', 'C'],
        gridMissingIds: ['D'],
        gridComplete: false,
        managerIds: ['A', 'B', 'C', 'D'],
        managerComplete: true,
        windowIds: ['A', 'B', 'C'],
      },
      rows: ['A', 'B', 'C'].map((id) => ({
        id,
        ok: true,
        activeObserved: true,
        playingObserved: true,
        advancedObserved: true,
        indexDelta: 5,
        timestampDelta: 300_000,
        advanceContradiction: false,
        state: { isActive: true, isPlaying: true, speed: 10 },
      })),
    },
  });
  staleTopology.phases.P4.probe.windowCount = 3;
  const cells = assertPoCpuAbBenchmarkReport(staleTopology);
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'RED');
  assert.equal(p4.probeWindowCount, 3);
  assert.equal(p4.topologyOk, false);
  assert.match(p4.detail, /gridIds=A,B,C/);
});

test('fault-injection: pause negative control requires mutation marker and P7 state red', () => {
  const killed = assertPoCpuAbBenchmarkReport(report({
    mutant: true,
    p7Replay: { ok: false, state: { isPlaying: true, speed: 10 }, mutantApplied: true },
  }), { mutant: true });
  assert.equal(killed.find((cell) => cell.name === 'P7-PAUSE-STATE-NOT-PLAYING').status, 'RED');
  assert.equal(killed.find((cell) => cell.name === 'NC-P7-REPLAY-PAUSE-TEARDOWN-MUST-RED').status, 'GREEN');

  const noisyWorkOnly = assertPoCpuAbBenchmarkReport(report({ mutant: true, p7WorkRatio: 0.8 }), { mutant: true });
  assert.equal(noisyWorkOnly.find((cell) => cell.name === 'P7-WORK-RETURNS-TO-P1-FLOOR').status, 'RED');
  assert.equal(noisyWorkOnly.find((cell) => cell.name === 'NC-P7-REPLAY-PAUSE-TEARDOWN-MUST-RED').status, 'RED');
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

test('fault-injection: P6 work margin is a hard conjunct, not a state tautology', () => {
  const cells = assertPoCpuAbBenchmarkReport(report({
    p1WorkRatio: 0.02,
    p6WorkRatio: 0.025,
  }));
  const p6 = cells.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED');
  assert.equal(p6.status, 'RED');
  assert.equal(p6.workExceedsP1, false);
  assert.equal(p6.playheadAdvanced, true);
});

test('fault-injection: P6 requires advancedObserved and concrete playhead advance', () => {
  const noFlag = assertPoCpuAbBenchmarkReport(report({
    p6Replay: { advancedObserved: false, indexDelta: 5, timestampDelta: 300_000 },
  }));
  assert.equal(noFlag.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED').status, 'RED');

  const noDelta = assertPoCpuAbBenchmarkReport(report({
    p6Replay: {
      advancedObserved: true,
      indexDelta: 0,
      timestampDelta: 0,
      beforeState: { currentIndex: 10, currentTimestamp: 1_000_000 },
      state: { isActive: true, isPlaying: true, currentIndex: 10, currentTimestamp: 1_000_000, speed: 10 },
    },
  }));
  assert.equal(noDelta.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED').status, 'RED');
});

test('fault-injection: P4/P6 require forward timestamp movement', () => {
  const p4ContradictionRows = ['A', 'B', 'C', 'D'].map((id) => ({
    id,
    ok: true,
    activeObserved: true,
    playingObserved: true,
    advancedObserved: true,
    indexDelta: 8,
    timestampDelta: -300_000,
    advanceContradiction: true,
    state: { isActive: true, isPlaying: true, speed: 10 },
  }));
  const p4Cells = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: true,
      panelCount: 4,
      playingCount: 4,
      advancedCount: 4,
      rows: p4ContradictionRows,
    },
  }));
  const p4 = p4Cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'RED');
  assert.equal(p4.advancedCount, 0);

  const p6Cells = assertPoCpuAbBenchmarkReport(report({
    p6Replay: {
      advancedObserved: true,
      indexDelta: 8,
      timestampDelta: -300_000,
      advanceContradiction: true,
      beforeState: { currentIndex: 10, currentTimestamp: 1_000_000 },
      state: { isActive: true, isPlaying: true, currentIndex: 18, currentTimestamp: 700_000, speed: 10 },
    },
  }));
  const p6 = p6Cells.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED');
  assert.equal(p6.status, 'RED');
  assert.equal(p6.advanceContradiction, true);
});

test('fault-injection: null pre-arm timestamp source cannot mint advanced GREEN', () => {
  const fabricatedBefore = {
    isActive: true,
    isPlaying: false,
    currentIndex: 10,
    currentTimestamp: 0,
    currentTimestampSource: 'replayTimestamp',
    speed: 10,
  };
  const rawAfter = {
    isActive: true,
    isPlaying: true,
    currentIndex: 15,
    currentTimestamp: 1_700_000_000_000,
    currentTimestampSource: 'fullRawData[currentIndex]',
    speed: 10,
  };
  const p4Rows = ['A', 'B', 'C', 'D'].map((id) => ({
    id,
    ok: true,
    activeObserved: true,
    playingObserved: true,
    advancedObserved: true,
    indexDelta: 5,
    timestampDelta: 1_700_000_000_000,
    advanceContradiction: false,
    beforeState: fabricatedBefore,
    state: rawAfter,
  }));
  const p4Cells = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: true,
      panelCount: 4,
      playingCount: 4,
      advancedCount: 4,
      rows: p4Rows,
    },
  }));
  const p4 = p4Cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'RED');
  assert.equal(p4.advancedCount, 0);
  assert.equal(p4.rowAdvances.every((advance) => advance.sourceChanged), true);

  const p6Cells = assertPoCpuAbBenchmarkReport(report({
    p6Replay: {
      advancedObserved: true,
      indexDelta: 5,
      timestampDelta: 1_700_000_000_000,
      advanceContradiction: false,
      beforeState: fabricatedBefore,
      state: rawAfter,
    },
  }));
  const p6 = p6Cells.find((cell) => cell.name === 'P6-REPLAY-10X-OR-NEAREST-OBSERVED');
  assert.equal(p6.status, 'RED');
  assert.equal(p6.timestampSourceChanged, true);
  assert.equal(p6.playheadAdvanced, false);
});

test('fault-injection: P4 recomputes advance contradiction instead of trusting row flag', () => {
  const rows = ['A', 'B', 'C', 'D'].map((id) => ({
    id,
    ok: true,
    activeObserved: true,
    playingObserved: true,
    advancedObserved: true,
    indexDelta: 1680,
    timestampDelta: -19_200_000,
    advanceContradiction: false,
    beforeState: { isActive: true, isPlaying: false, currentIndex: 10, currentTimestamp: 20_000_000, speed: 10 },
    state: { isActive: true, isPlaying: true, currentIndex: 1690, currentTimestamp: 800_000, speed: 10 },
  }));
  const cells = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: true,
      panelCount: 4,
      playingCount: 4,
      advancedCount: 4,
      rows,
    },
  }));
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'RED');
  assert.equal(p4.advancedCount, 0);
  assert.equal(p4.rowAdvances.every((advance) => advance.advanceContradiction), true);
});

test('fault-injection: P4 detail cannot count stale row delta as sustained advance', () => {
  const rows = ['A', 'B', 'C', 'D'].map((id, index) => ({
    id,
    ok: index !== 1,
    activeObserved: true,
    playingObserved: true,
    advancedObserved: index !== 1,
    indexDelta: index === 1 ? 0 : 5,
    timestampDelta: 300_000,
    advanceContradiction: false,
    beforeState: { isActive: true, isPlaying: false, currentIndex: 10, currentTimestamp: 1_000_000, currentTimestampSource: 'replayTimestamp', speed: 10 },
    state: {
      isActive: true,
      isPlaying: true,
      currentIndex: index === 1 ? 10 : 15,
      currentTimestamp: index === 1 ? 1_000_000 : 1_300_000,
      currentTimestampSource: 'replayTimestamp',
      speed: 10,
    },
  }));
  const cells = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: false,
      panelCount: 4,
      playingCount: 4,
      advancedCount: 3,
      armingFailure: 'not every panel advanced by forward replay timestamp',
      rows,
    },
  }));
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'RED');
  assert.equal(p4.advancedCount, 3);
  assert.match(p4.detail, /advanced=3/);
});

test('fault-injection: P4 requires distinct self-consistent A/B/C/D topology', () => {
  const cells = assertPoCpuAbBenchmarkReport(report({
    p4Replay: {
      ok: true,
      topology: {
        gridPresent: true,
        gridHasGetPanelIds: true,
        gridIds: ['A', 'B', 'C', 'C'],
        gridMissingIds: ['D'],
        gridComplete: false,
        managerIds: ['A', 'B', 'C', 'D'],
        managerComplete: true,
        managerGridConsistent: false,
        windowIds: ['A', 'B', 'C', 'D'],
        windowComplete: true,
        selfConsistent: false,
      },
    },
  }));
  const p4 = cells.find((cell) => cell.name === 'P4-FOUR-PANEL-REPLAY-RUNNING-OBSERVED');
  assert.equal(p4.status, 'RED');
  assert.equal(p4.topologyOk, false);
  assert.equal(p4.rowsDistinctRequired, true);
  assert.match(p4.detail, /gridIds=A,B,C,C/);
});

test('unit: replay arming guard does not self-cancel deferred start', () => {
  const context = {};
  vm.runInNewContext(`${poCpuAbReplayArmingHelpersSource()}; this.attemptReplayStart = attemptReplayStart;`, context);
  const playCalls = [];
  const rs = {
    isPlaying: false,
    isPlayStarting: false,
    getPlaybackLoopKind() {
      return this.isPlayStarting ? 'tick' : null;
    },
    play() {
      playCalls.push('play');
      this.isPlayStarting = true;
    },
  };
  const toggleState = { usedToggle: false };
  assert.equal(context.attemptReplayStart(rs, toggleState), true);
  assert.equal(context.attemptReplayStart(rs, toggleState), false);
  assert.deepEqual(playCalls, ['play']);

  rs.isPlayStarting = false;
  rs.isPlaying = true;
  assert.equal(context.attemptReplayStart(rs, toggleState), false);
  assert.deepEqual(playCalls, ['play']);
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
  assert.match(mutated, /pause\(\) \{\n        try \{ window\.__PO_CPU_AB_PAUSE_MUTANT_APPLIED = true; \} catch \(_\) \{\}\n        return;\n        this\._cancelDeferredPlayStart\(\);/);
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

test('fault-injection: injected browser report validates full acceptance path', async () => {
  const result = await runPoCpuAbBenchmarkGate({
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
  assert.equal(result.report.meta.shortened, false);
});

test('fault-injection: shortened browser report is non-ship SHORT evidence', async () => {
  const result = await runPoCpuAbBenchmarkGate({
    short: true,
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: report({ shortened: true }),
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.signature, PO_CPU_AB_SIGNATURE);
  assert.equal(result.status, PO_CPU_AB_STATUS_SHORT);
  assert.equal(result.report.meta.shortened, true);
  assert.equal(result.meta.shortened, true);
});

test('fault-injection: --p2-ms override stamps shortened and cannot mint GREEN', async () => {
  const result = await runPoCpuAbBenchmarkGate({
    timings: { p2IdleMs: 5000, p2Override: true },
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: report(),
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, PO_CPU_AB_STATUS_SHORT);
  assert.equal(result.meta.shortened, true);
  assert.equal(result.meta.p2Override, true);
  assert.equal(result.report.meta.shortened, false);
});

test('fault-injection: injected preflight requires mutant P7 red', async () => {
  let calls = 0;
  const preflight = await runPoCpuAbBenchmarkPreflight({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => {
      calls += 1;
      return {
        report: calls === 2
          ? report({ mutant: true, p7Replay: { ok: false, state: { isPlaying: true, speed: 10 }, mutantApplied: true } })
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
