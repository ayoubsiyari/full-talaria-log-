/**
 * B-M6 SL/TP entry-drag follow — BEHAVIOURAL SPECIFICATION, **NOT** A REGRESSION GATE.
 *
 * ============================================================================
 * §A15.3 NOT-BEHAVIOUR-COVERING STAMP  (behavioural spec — not a gate)
 * ============================================================================
 *
 * COVERAGE: behavioural specification only. This file executes a labelled
 * transcription of the drag mechanism (see sourceNote() below), not live
 * order-manager.js code. It does NOT execute product code, does NOT run a
 * browser, and provides NO evidence about on-screen behaviour in the product.
 *
 * SURFACE: harness only. Not verified on host, not verified on panel.
 *
 * This artefact is a behavioural SPECIFICATION, not a gate. It cannot fail on
 * a product regression: order-manager.js can change arbitrarily while every
 * cell here still passes. It must never be cited as verification evidence.
 * Per §A15.3 / VER-03 it does not wear the `.red.` convention (formerly
 * `*.red.mjs`, which misrepresented its role).
 *
 * Treat it as an executable description of intended behaviour and as a design
 * reference only. Do not wire it into any gate suite.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KILL_SWITCH_NAMES = [
  '__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX',
  '__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1',
];

function findRepoRoot(startDir) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4', 'chart', 'modules', 'order-manager.js'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Could not resolve repository root from ${startDir}`);
}

const repoRoot = findRepoRoot(__dirname);
const fixturePath = path.join(repoRoot, 'chart v 1.4', 'chart', 'modules', 'b-fixtures', 'm6-entry-drag-sltp.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : 'true'];
  })
);

const state = args.get('state') || 'current';
const invertedCell = args.get('invert') || '';
const tolerance = fixture.meta.tolerance;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function approxEqual(actual, expected, tol, message) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${message}: actual=${actual}, expected=${expected}, tolerance=${tol}`
  );
}

function formatPrice(value) {
  return Number(value).toFixed(2);
}

class LinearYScale {
  constructor({ height, minPrice, maxPrice }) {
    this.height = height;
    this.minPrice = minPrice;
    this.maxPrice = maxPrice;
    this.pxPerPrice = height / (maxPrice - minPrice);
  }

  y(price) {
    return (this.maxPrice - price) * this.pxPerPrice;
  }

  invert(y) {
    return this.maxPrice - (y / this.pxPerPrice);
  }
}

class FakeSvgElement {
  constructor(label, recorder) {
    this.label = label;
    this.recorder = recorder;
    this.attrs = new Map();
    this.writes = [];
  }

  attr(name, value) {
    if (arguments.length === 1) return this.attrs.get(name);
    this.attrs.set(name, value);
    this.writes.push({ frame: this.recorder.frame, name, value });
    return this;
  }
}

function makeLine(label, price, scale, recorder) {
  const y = scale.y(price);
  const line = new FakeSvgElement(`${label}-line`, recorder);
  line.attr('y1', y).attr('y2', y);
  return { label, price, line };
}

function installKillSwitchWindow(enabled) {
  const previous = globalThis.window;
  globalThis.window = {};
  for (const name of KILL_SWITCH_NAMES) globalThis.window[name] = !!enabled;
  return () => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  };
}

function fixesEnabled({ corrected }) {
  return corrected
    && !globalThis.window?.__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX
    && !globalThis.window?.__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1;
}

function makeRecorder() {
  return {
    frame: 'setup',
    dragOps: new Map(),
    releaseOps: new Set(),
    storeWritesByFrame: new Map(),
    addDragOp(frame, op) {
      const set = this.dragOps.get(frame) || new Set();
      set.add(op);
      this.dragOps.set(frame, set);
    },
    addReleaseOp(op) {
      this.releaseOps.add(op);
    },
    writeStore(frame, key) {
      const set = this.storeWritesByFrame.get(frame) || new Set();
      set.add(key);
      this.storeWritesByFrame.set(frame, set);
    },
  };
}

function computeQuantity(scenario, entryPrice, slPrice) {
  const riskPips = Math.abs(entryPrice - slPrice) / scenario.pipSize;
  return scenario.riskAmountUsd / (riskPips * scenario.pipValuePerLot);
}

function computePnl(order, takeProfit) {
  return (takeProfit - order.entryPrice) * order.quantity * 100;
}

function simulateDraftEntryDrag(data, { corrected, killSwitches }) {
  const restoreWindow = installKillSwitchWindow(killSwitches);
  try {
    const scenario = data.draftOrder;
    const scale = new LinearYScale(data.chart);
    const recorder = makeRecorder();
    const enabled = fixesEnabled({ corrected });
    const slDistance = scenario.entryPrice - scenario.stopLoss;
    const tpDistance = scenario.takeProfit - scenario.entryPrice;
    const lines = {
      entry: makeLine('entry', scenario.entryPrice, scale, recorder),
      sl: makeLine('sl', scenario.stopLoss, scale, recorder),
      tp: makeLine('tp', scenario.takeProfit, scale, recorder),
    };
    const initial = {
      slY: lines.sl.line.attr('y1'),
      tpY: lines.tp.line.attr('y1'),
    };
    const frames = [];
    const freezePaintSuppressedFrames = [];
    const quantities = [];
    const placeButtonTexts = [];

    for (const frame of data.entryDragFrames) {
      recorder.frame = frame.frame;
      const entryPrice = frame.entryPrice;
      lines.entry.price = entryPrice;
      lines.entry.line.attr('y1', scale.y(entryPrice)).attr('y2', scale.y(entryPrice));

      if (enabled) {
        lines.sl.price = entryPrice - slDistance;
        lines.tp.price = entryPrice + tpDistance;
        lines.sl.line.attr('y1', scale.y(lines.sl.price)).attr('y2', scale.y(lines.sl.price));
        lines.tp.line.attr('y1', scale.y(lines.tp.price)).attr('y2', scale.y(lines.tp.price));
        recorder.addDragOp(frame.frame, 'paintSL');
        recorder.addDragOp(frame.frame, 'paintTP');
        recorder.addDragOp(frame.frame, 'riskReward');
        recorder.addDragOp(frame.frame, 'quantity');
        recorder.addDragOp(frame.frame, 'placeButtonText');
        quantities.push(computeQuantity(scenario, entryPrice, lines.sl.price));
        placeButtonTexts.push(`Place ${scenario.side} ${formatPrice(entryPrice)}`);
      } else {
        freezePaintSuppressedFrames.push(frame.frame);
      }

      frames.push({
        frame: frame.frame,
        entryPrice,
        slPrice: lines.sl.price,
        tpPrice: lines.tp.price,
        entryY: lines.entry.line.attr('y1'),
        slY: lines.sl.line.attr('y1'),
        tpY: lines.tp.line.attr('y1'),
      });
    }

    recorder.frame = 'release';
    const finalEntry = data.entryDragFrames.at(-1).entryPrice;
    if (!enabled) {
      lines.sl.price = finalEntry - slDistance;
      lines.tp.price = finalEntry + tpDistance;
      lines.sl.line.attr('y1', scale.y(lines.sl.price)).attr('y2', scale.y(lines.sl.price));
      lines.tp.line.attr('y1', scale.y(lines.tp.price)).attr('y2', scale.y(lines.tp.price));
      quantities.push(computeQuantity(scenario, finalEntry, lines.sl.price));
      placeButtonTexts.push(`Place ${scenario.side} ${formatPrice(finalEntry)}`);
    }
    for (const op of ['paintSL', 'paintTP', 'riskReward', 'quantity', 'placeButtonText']) recorder.addReleaseOp(op);

    return {
      frames,
      release: {
        entryPrice: finalEntry,
        slPrice: lines.sl.price,
        tpPrice: lines.tp.price,
        slY: lines.sl.line.attr('y1'),
        tpY: lines.tp.line.attr('y1'),
      },
      initial,
      recorder,
      quantities,
      placeButtonTexts,
      freezePaintSuppressedFrames,
    };
  } finally {
    restoreWindow();
  }
}

function simulateOpenExecutedEntryDrag(data, { corrected, killSwitches }) {
  const restoreWindow = installKillSwitchWindow(killSwitches);
  try {
    const scenario = data.openExecutedOrder;
    const scale = new LinearYScale(data.chart);
    const recorder = makeRecorder();
    const enabled = fixesEnabled({ corrected });
    const slDistance = scenario.entryPrice - scenario.stopLoss;
    const tpDistance = scenario.takeProfit - scenario.entryPrice;
    const lines = {
      entry: makeLine('open-entry', scenario.entryPrice, scale, recorder),
      sl: makeLine('open-sl', scenario.stopLoss, scale, recorder),
      tp: makeLine('open-tp', scenario.takeProfit, scale, recorder),
    };
    const initial = {
      slY: lines.sl.line.attr('y1'),
      tpY: lines.tp.line.attr('y1'),
    };
    const frames = [];

    for (const frame of data.entryDragFrames) {
      recorder.frame = frame.frame;
      const entryPrice = frame.entryPrice;
      lines.entry.price = entryPrice;
      lines.entry.line.attr('y1', scale.y(entryPrice)).attr('y2', scale.y(entryPrice));

      if (enabled) {
        lines.sl.price = entryPrice - slDistance;
        lines.tp.price = entryPrice + tpDistance;
        lines.sl.line.attr('y1', scale.y(lines.sl.price)).attr('y2', scale.y(lines.sl.price));
        lines.tp.line.attr('y1', scale.y(lines.tp.price)).attr('y2', scale.y(lines.tp.price));
        recorder.addDragOp(frame.frame, 'paintOpenSL');
        recorder.addDragOp(frame.frame, 'paintOpenTP');
      }

      frames.push({
        frame: frame.frame,
        entryPrice,
        slPrice: lines.sl.price,
        tpPrice: lines.tp.price,
        slY: lines.sl.line.attr('y1'),
        tpY: lines.tp.line.attr('y1'),
      });
    }

    recorder.frame = 'release';
    const finalEntry = data.entryDragFrames.at(-1).entryPrice;
    if (!enabled) {
      lines.sl.price = finalEntry - slDistance;
      lines.tp.price = finalEntry + tpDistance;
      lines.sl.line.attr('y1', scale.y(lines.sl.price)).attr('y2', scale.y(lines.sl.price));
      lines.tp.line.attr('y1', scale.y(lines.tp.price)).attr('y2', scale.y(lines.tp.price));
    }
    recorder.addReleaseOp('paintOpenSL');
    recorder.addReleaseOp('paintOpenTP');

    return {
      frames,
      release: {
        slPrice: lines.sl.price,
        tpPrice: lines.tp.price,
        slY: lines.sl.line.attr('y1'),
        tpY: lines.tp.line.attr('y1'),
      },
      initial,
      recorder,
    };
  } finally {
    restoreWindow();
  }
}

function simulateDraftTpDrag(data, { corrected, killSwitches }) {
  const restoreWindow = installKillSwitchWindow(killSwitches);
  try {
    const scenario = data.openExecutedOrder;
    const recorder = makeRecorder();
    const enabled = fixesEnabled({ corrected });
    const frames = [];

    for (const frame of data.tpDragFrames) {
      recorder.frame = frame.frame;
      let pnl = 0;
      if (enabled) {
        pnl = computePnl(scenario, frame.takeProfit);
        recorder.addDragOp(frame.frame, 'pnl');
      }
      frames.push({ frame: frame.frame, takeProfit: frame.takeProfit, pnl });
    }

    recorder.frame = 'release';
    recorder.addReleaseOp('pnl');
    return {
      frames,
      release: { pnl: computePnl(scenario, data.tpDragFrames.at(-1).takeProfit) },
      recorder,
    };
  } finally {
    restoreWindow();
  }
}

function makeRunData() {
  const data = clone(fixture);
  if (state === 'corrupted') {
    data.draftOrder.expectedDistances.entryToSL += 0.25;
    data.openExecutedOrder.expectedDistances.entryToSL += 0.25;
  }
  const corrected = state === 'corrected' || state === 'corrupted';
  return {
    data,
    corrected,
    draft: simulateDraftEntryDrag(data, { corrected, killSwitches: false }),
    open: simulateOpenExecutedEntryDrag(data, { corrected, killSwitches: false }),
    tp: simulateDraftTpDrag(data, { corrected, killSwitches: false }),
  };
}

function assertMovedEveryFrame(frames, field, initial, label) {
  let previous = initial;
  for (const frame of frames) {
    assert.notEqual(frame[field], previous, `${label}: expected ${field} to change on frame ${frame.frame}`);
    previous = frame[field];
  }
}

function assertDidNotMoveDuringDrag(frames, field, initial, label) {
  for (const frame of frames) {
    approxEqual(frame[field], initial, tolerance.pixel, `${label}: expected ${field} to stay release-gated on frame ${frame.frame}`);
  }
}

function assertDistancePreserved(frames, expected, label) {
  for (const frame of frames) {
    approxEqual(frame.entryPrice - frame.slPrice, expected.entryToSL, tolerance.price, `${label}: entry-to-SL distance frame ${frame.frame}`);
    approxEqual(frame.tpPrice - frame.entryPrice, expected.entryToTP, tolerance.price, `${label}: entry-to-TP distance frame ${frame.frame}`);
  }
}

function assertOpEveryFrame(recorder, op, frames, label) {
  for (const frame of frames) {
    assert.ok(recorder.dragOps.get(frame.frame)?.has(op), `${label}: missing ${op} on drag frame ${frame.frame}`);
  }
}

function assertReleaseSubsetOfDrag(recorder, label) {
  const dragUnion = new Set();
  for (const set of recorder.dragOps.values()) {
    for (const op of set) dragUnion.add(op);
  }
  for (const op of recorder.releaseOps) {
    assert.ok(dragUnion.has(op), `${label}: ${op} ran at release without also running during drag`);
  }
}

function assertNoProtectionStoreWrites(summary, label) {
  for (const [frame, writes] of summary.open.recorder.storeWritesByFrame) {
    const protectionWrites = [...writes].filter((key) => key === 'stopLoss' || key === 'takeProfit');
    assert.deepEqual(protectionWrites, [], `${label}: protection store write during frame ${frame}`);
  }
}

function assertPnLPerFrame(summary) {
  const pnls = summary.tp.frames.map((frame) => frame.pnl);
  for (const frame of summary.tp.frames) {
    assert.notEqual(frame.pnl, 0, `PER-FRAME PnL: frame ${frame.frame} stayed at 0`);
  }
  for (let i = 1; i < pnls.length; i += 1) {
    assert.notEqual(pnls[i], pnls[i - 1], `PER-FRAME PnL: pnl did not change between frames ${i} and ${i + 1}`);
  }
}

const cellRunners = new Map([
  ['B-M6-01', (summary) => {
    if (invertedCell === 'B-M6-01') {
      assertDidNotMoveDuringDrag(summary.draft.frames, 'slY', summary.draft.initial.slY, 'inverted ENTRY DRAG MOVES SL');
      return;
    }
    assertMovedEveryFrame(summary.draft.frames, 'slY', summary.draft.initial.slY, 'ENTRY DRAG MOVES SL');
  }],
  ['B-M6-02', (summary) => {
    assertMovedEveryFrame(summary.draft.frames, 'tpY', summary.draft.initial.tpY, 'ENTRY DRAG MOVES TP');
  }],
  ['B-M6-03', (summary) => {
    assertDistancePreserved(summary.draft.frames, summary.data.draftOrder.expectedDistances, 'ENTRY DRAG PRESERVES SL AND TP DISTANCE');
  }],
  ['B-M6-04', (summary) => {
    assertMovedEveryFrame(summary.open.frames, 'slY', summary.open.initial.slY, 'OPEN EXECUTED ORDER moves SL');
    assertMovedEveryFrame(summary.open.frames, 'tpY', summary.open.initial.tpY, 'OPEN EXECUTED ORDER moves TP');
    assertDistancePreserved(summary.open.frames, summary.data.openExecutedOrder.expectedDistances, 'OPEN EXECUTED ORDER preserves distances');
  }],
  ['B-M6-05', (summary) => {
    assertOpEveryFrame(summary.draft.recorder, 'riskReward', summary.draft.frames, 'PER-FRAME RISK/REWARD');
  }],
  ['B-M6-06', (summary) => {
    assertOpEveryFrame(summary.draft.recorder, 'quantity', summary.draft.frames, 'PER-FRAME QUANTITY');
    assert.equal(summary.draft.quantities.length, summary.draft.frames.length, 'PER-FRAME QUANTITY: quantity recompute count');
  }],
  ['B-M6-07', assertPnLPerFrame],
  ['B-M6-08', (summary) => {
    assertOpEveryFrame(summary.draft.recorder, 'placeButtonText', summary.draft.frames, 'PER-FRAME PLACE-BUTTON TEXT');
    assert.equal(summary.draft.placeButtonTexts.length, summary.draft.frames.length, 'PER-FRAME PLACE-BUTTON TEXT: update count');
    assert.equal(new Set(summary.draft.placeButtonTexts).size, summary.draft.frames.length, 'PER-FRAME PLACE-BUTTON TEXT: text must change with entry price');
  }],
  ['B-M6-09', (summary) => {
    assertReleaseSubsetOfDrag(summary.draft.recorder, 'NO WORK DEFERRED TO RELEASE (draft)');
    assertReleaseSubsetOfDrag(summary.tp.recorder, 'NO WORK DEFERRED TO RELEASE (TP PnL)');
    assertReleaseSubsetOfDrag(summary.open.recorder, 'NO WORK DEFERRED TO RELEASE (open order)');
  }],
  ['B-M6-10', (summary) => {
    assert.deepEqual(summary.draft.freezePaintSuppressedFrames, [], 'DRAG-FREEZE FLAG DOES NOT SUPPRESS PAINT: paint was suppressed while dragging');
  }],
  ['B-M6-11', (summary) => {
    const killedDraft = simulateDraftEntryDrag(summary.data, { corrected: true, killSwitches: true });
    assertDidNotMoveDuringDrag(killedDraft.frames, 'slY', killedDraft.initial.slY, 'KILL-SWITCH OFF PATH SL');
    assertDidNotMoveDuringDrag(killedDraft.frames, 'tpY', killedDraft.initial.tpY, 'KILL-SWITCH OFF PATH TP');
    assert.notEqual(killedDraft.release.slY, killedDraft.frames.at(-1).slY, 'KILL-SWITCH OFF PATH: SL must move only on release');
    assert.notEqual(killedDraft.release.tpY, killedDraft.frames.at(-1).tpY, 'KILL-SWITCH OFF PATH: TP must move only on release');
    assert.deepEqual(KILL_SWITCH_NAMES, [
      '__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX',
      '__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1',
    ], 'KILL-SWITCH OFF PATH: exact existing switch names exercised');
  }],
  ['B-M6-12', (summary) => {
    assertNoProtectionStoreWrites(summary, 'NO STORE WRITE PER FRAME');
  }],
]);

function sourceNote() {
  return [
    'Source under test: LABELLED TRANSCRIPTION, not live order-manager.js.',
    'Reason: makePreviewLineDraggable and makeLineDraggable are embedded browser/D3 methods in order-manager.js, not exported Node units; loading the file would require the full chart DOM, d3 drag behavior, document listeners, SVG layout, rAF, and module-local helpers.',
    'Cost: this red test verifies the specified mechanism and two paths deterministically, but it can drift from product implementation if order-manager.js changes without updating the transcription.',
  ];
}

async function run() {
  const summary = makeRunData();
  const results = [];

  for (const cell of summary.data.cells) {
    const runner = cellRunners.get(cell.id);
    try {
      assert.equal(typeof runner, 'function', `No runner registered for ${cell.id}`);
      runner(summary);
      results.push({ cell, status: 'PASS', detail: 'contract satisfied' });
    } catch (error) {
      const detail = String(error?.message || error).split('\n')[0];
      results.push({ cell, status: 'FAIL', detail });
    }
  }

  console.log('B-M6 SL/TP entry-drag follow red matrix');
  console.log(`Fixture: ${path.relative(repoRoot, fixturePath)}`);
  console.log(`State: ${state}${invertedCell ? `; inverted=${invertedCell}` : ''}`);
  for (const line of sourceNote()) console.log(line);
  console.log(`Tolerance: price=${tolerance.price}, pixel=${tolerance.pixel}`);
  for (const result of results) {
    console.log(`${result.cell.id} ${result.cell.name}: ${result.status} - ${result.detail}`);
  }
  const passed = results.filter((result) => result.status === 'PASS').length;
  const failed = results.length - passed;
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`B-M6 red contract failed: ${failed} cell(s) failing`);
    process.exitCode = 1;
  }
}

await run();
