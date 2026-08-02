/**
 * PATH-01 — generatePath writes deterministic event-level waypoints into
 * per-panel scratch, and cannot reach order-resolution state.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    if (fs.existsSync(chart) && fs.existsSync(path.join(cursor, 'homepage', 'public', 'chart', 'chart.js'))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing`);
  return match[0].replace(/\n+$/, '\n');
}

function assertPathHasNoOrderReach(methods) {
  const forbidden = /\b(orderManager|OrderManager|order-service|trade-attribution|stopLoss|takeProfit|fillPrice|execution|journal|_resolve(?:Order|Trade|Journal|.*Attribution))\b/;
  for (const [name, source] of Object.entries(methods)) {
    assert.doesNotMatch(source, forbidden, `${name} must not reach order-resolution state`);
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const REPLAY = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const REPLAY_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
const replaySource = fs.readFileSync(REPLAY, 'utf8');
const replayMirrorSource = fs.readFileSync(REPLAY_MIRROR, 'utf8');
globalThis.window = globalThis.window || {};
const ReplaySystem = require(REPLAY);

function makeReplay(symbol = 'EURUSD') {
  const replay = Object.create(ReplaySystem.prototype);
  replay.chart = { currentSymbol: symbol };
  return replay;
}

test('A1: waypoints are open, transcript event levels, close in order', () => {
  const replay = makeReplay('EURUSD');
  const candle = {
    symbol: 'EURUSD',
    t: 1730000000000,
    o: 100,
    h: 106,
    l: 94,
    c: 101,
    resolvedEventLevels: [{ price: 104 }, { level: 96 }, 103],
  };

  const pathOut = replay.generatePath(candle, 25);
  assert.equal(pathOut, replay._tickPathScratch, 'generatePath must return the reused per-panel path scratch');
  assert.equal(pathOut[0], candle.o, 'open anchor is first');
  assert.equal(pathOut[pathOut.length - 1], candle.c, 'close anchor is last');

  const indices = [
    pathOut.indexOf(104),
    pathOut.indexOf(96),
    pathOut.indexOf(103),
  ];
  assert.deepEqual(indices.map((i) => i >= 0), [true, true, true], 'resolved event levels must be exact waypoints');
  assert.ok(indices[0] < indices[1] && indices[1] < indices[2], 'event levels keep transcript order');
});

test('A1: deterministic seed is symbol plus bar timestamp', () => {
  const replay = makeReplay('NQ');
  const candle = {
    symbol: 'NQ',
    t: 1730000060000,
    o: 20000,
    h: 20040,
    l: 19980,
    c: 20010,
    resolvedEventLevels: [20030, 19990],
  };

  const first = Array.from(replay.generatePath(candle, 32));
  const second = Array.from(replay.generatePath({ ...candle }, 32));
  const changedSymbol = Array.from(replay.generatePath({ ...candle, symbol: 'ES' }, 32));
  const changedTime = Array.from(replay.generatePath({ ...candle, t: candle.t + 60000 }, 32));

  assert.deepEqual(second, first, 'same symbol and timestamp produce the same path');
  assert.notDeepEqual(changedSymbol, first, 'symbol participates in the deterministic seed');
  assert.notDeepEqual(changedTime, first, 'bar timestamp participates in the deterministic seed');
});

test('A4: filler is bounded and cannot create a visual extreme', () => {
  const replay = makeReplay('GBPUSD');
  const candle = {
    symbol: 'GBPUSD',
    t: 1730000120000,
    o: 100,
    h: 120,
    l: 80,
    c: 101,
    resolvedEventLevels: [106, 94, 104],
  };

  const pathOut = Array.from(replay.generatePath(candle, 96));
  assert.equal(Math.max(...pathOut), 106, 'highest visual extreme comes from a waypoint');
  assert.equal(Math.min(...pathOut), 94, 'lowest visual extreme comes from a waypoint');
  for (const price of pathOut) {
    assert.ok(price >= 94 && price <= 106, `filler stayed inside waypoint extremes: ${price}`);
  }
});

test('A4: default generation does not allocate per-bar path arrays', () => {
  const replay = makeReplay('BTCUSD');
  replay.ticksPerCandle = 16;
  const a = { symbol: 'BTCUSD', t: 1, o: 10, h: 12, l: 8, c: 11, resolvedEventLevels: [11.5, 9] };
  const b = { symbol: 'BTCUSD', t: 2, o: 20, h: 22, l: 18, c: 19, resolvedEventLevels: [18.5, 21] };

  const first = replay.getTickPath(a);
  const second = replay.getTickPath(b);
  assert.equal(first, second, 'default getTickPath reuses one per-panel scratch path');
  assert.equal(replay.tickPathCache, undefined, 'default path does not retain per-bar cache arrays');

  const source = `${methodSource(replaySource, 'generatePath')}\n${methodSource(replaySource, '_collectPathWaypoints')}`;
  assert.match(source, /this\._tickPathScratch/, 'generator must use path scratch');
  assert.match(source, /this\._pathWaypointScratch/, 'generator must use waypoint scratch');
  assert.doesNotMatch(source, /new Array|\[\.\.\.|Array\.from\s*\(|\.map\s*\(|\.reduce\s*\(/,
    'generator must not allocate per-bar arrays');
});

test('A4: retained cached paths do not alias the transient scratch path', () => {
  const replay = makeReplay('BTCUSD');
  replay.ticksPerCandle = 8;
  const firstBar = { symbol: 'BTCUSD', t: 1, o: 100, h: 112, l: 98, c: 106, resolvedEventLevels: [109] };
  const secondBar = { symbol: 'BTCUSD', t: 2, o: 200, h: 212, l: 198, c: 206, resolvedEventLevels: [209] };

  const retained = replay.getRetainedTickPath(firstBar, 'animatingCandle');
  const retainedHead = retained[0];
  const transient = replay.getTickPath(secondBar);

  assert.notEqual(retained, transient, 'retained cachedPath must not be the transient scratch object');
  assert.notEqual(transient[0], retainedHead, 'anti-vacuity: second bar path is genuinely different');
  assert.equal(retained[0], retainedHead, 'later transient generation must not rewrite retained cachedPath');
});

test('A4: independent-pair and aggregate generation do not clobber retained paths', () => {
  const replay = makeReplay('NQ');
  replay.ticksPerCandle = 8;
  replay.currentTicksPerCandle = 8;
  replay.sessionStartIndex = 0;
  const firstBar = { symbol: 'NQ', t: 1000, o: 100, h: 112, l: 98, c: 106, v: 1, resolvedEventLevels: [109] };
  const secondBar = { symbol: 'NQ', t: 2000, o: 200, h: 212, l: 198, c: 206, v: 1, resolvedEventLevels: [209] };
  replay.fullRawData = [firstBar, secondBar];

  const retained = replay.getRetainedTickPath(firstBar, 'animatingCandle');
  const retainedHead = retained[0];
  replay.animatingCandle = { target: firstBar, cachedPath: retained };

  const pair = replay._buildIndependentPairAnimatedCandle(replay.fullRawData, 1500, {
    tickElapsedMs: 1,
    tickProgress: 2,
    ticksPerCandle: 8,
  });
  assert.ok(pair && pair.candle, 'independent pair fixture must produce a forming candle');
  assert.notEqual(pair.candle.o, firstBar.o, 'anti-vacuity: independent pair generated the second bar');
  assert.equal(retained[0], retainedHead, 'independent-pair generation must not rewrite retained cachedPath');

  const aggregate = replay.getAggregatedTickPath(1000, 2000);
  assert.ok(aggregate && aggregate.totalTicks >= 16, 'aggregate fixture must include both bars');
  assert.equal(retained[0], retainedHead, 'aggregate loop generation must not rewrite retained cachedPath');
});

test('A4: cachedPath retainers use retained slots, not transient getTickPath scratch', () => {
  for (const [label, source] of [
    ['canonical', replaySource],
    ['mirror', replayMirrorSource],
  ]) {
    assert.doesNotMatch(source, /cachedPath\s*=\s*this\.getTickPath\(/,
      `${label} cachedPath assignments must not retain transient scratch`);
    assert.match(source, /cachedPath:\s*prePath/, `${label} startTickAnimation still retains the prefetched path`);
    assert.match(source, /getRetainedTickPath\(targetCandle,\s*'animatingCandle'\)/,
      `${label} startTickAnimation must prefetch into the animating retained slot`);
    assert.match(source, /getRetainedTickPath\(tc,\s*'animatingCandle'\)/,
      `${label} step-clock helper must use the animating retained slot`);
  }
});

test('A6: path code has no import or reachability into order-resolution state', () => {
  assert.equal(replaySource, replayMirrorSource, 'replay mirror must be byte-identical');
  const methods = {
    generatePath: methodSource(replaySource, 'generatePath'),
    generateRandomPath: methodSource(replaySource, 'generateRandomPath'),
    collectPathWaypoints: methodSource(replaySource, '_collectPathWaypoints'),
    getTickPath: methodSource(replaySource, 'getTickPath'),
    getRetainedTickPath: methodSource(replaySource, 'getRetainedTickPath'),
  };
  assertPathHasNoOrderReach(methods);

  const mutant = {
    ...methods,
    generatePath: methods.generatePath.replace(
      'const waypoints = this._collectPathWaypoints(candle, open, close);',
      'const leaked = this.chart.orderManager; const waypoints = this._collectPathWaypoints(candle, open, close);',
    ),
  };
  assert.throws(
    () => assertPathHasNoOrderReach(mutant),
    /generatePath must not reach order-resolution state/,
    'deliberately wired order-state mutant must go RED',
  );
});
