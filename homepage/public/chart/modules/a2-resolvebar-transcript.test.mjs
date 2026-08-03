/**
 * A2 — CI-permanent money-path gate: resolveBar + bar-close transcript retention.
 *
 * Amendment money-path tier: execution bars come from raw/retained series (never
 * animatingCandle), and bar-close transcripts must be consumed/dropped at the
 * boundary so they cannot retain across closes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import crypto from 'node:crypto';
import vm from 'node:vm';

// SEAL-EVIDENCE-01: source evidence cannot bless served bytes. This gate reads the chart
// SOURCE, so it can show what the code says and not what the sealed build does.
// The token travels in the output because an audit document does not travel with
// a sweep log.
console.log("[SEAL-EVIDENCE-01] STATIC_ONLY_SOURCE_GATE A2 resolveBar transcript \u2014 reads source; served behaviour unobserved");


const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Named refusal instead of a bare ENOENT. A gate that cannot find its subject
 * has not tested it, and must not report that as the subject being defective.
 */
function readSubject(file) {
  if (!fs.existsSync(file)) throw new Error(`SUBJECT_ABSENT: ${file}`);
  return fs.readFileSync(file, 'utf8');
}


/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const repoRoot = findRoot(__dirname);
const chartOmPath = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/modules/order-manager.js');
const homeOmPath = path.resolve(findRoot(__dirname), 'homepage/public/chart/modules/order-manager.js');
const packageJsonPath = path.resolve(findRoot(__dirname), 'package.json');

function read(file) {
  return readSubject(file);
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function methodSource(text, name) {
  const marker = `    ${name}(`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const sigEnd = text.indexOf(') {', start);
  assert.notEqual(sigEnd, -1, `${name} must have a method signature`);
  let depth = 0;
  for (let i = sigEnd + 2; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = text.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

function loadOrderManagerClass() {
  const src = read(chartOmPath);
  const helper = functionSource(src, '_order01bMarketTimeCursorV1Enabled');
  const resolveBar = methodSource(src, 'resolveBar');
  const marketTime = methodSource(src, '_order01bMarketTimeMs');
  const ensureMap = methodSource(src, '_ensureBarCloseTranscriptMap');
  const record = methodSource(src, '_recordBarCloseTranscriptEvent');
  const consume = methodSource(src, '_consumeBarCloseTranscript');
  const census = methodSource(src, '_censusRetainedBarCloseTranscripts');
  const sync = methodSource(src, '_syncBarCloseTranscriptForCandle');
  const code = `
    ${helper}
    class OrderManager {
      constructor() {
        this._barCloseTranscripts = new Map();
        this._barCloseTranscriptActiveKey = null;
        this.chart = null;
        this.replaySystem = null;
        this._orderExecutionSeriesByFileId = null;
        this.pendingOrders = [];
        this.openPositions = [];
        this.mfeMaeTrackingPositions = [];
      }
      _getOrderContextChart() { return this.chart; }
      _playbackReplaySystem() { return this.replaySystem; }
      _orderExecutionSeriesContext() { return null; }
      ${resolveBar}
      ${marketTime}
      ${ensureMap}
      ${record}
      ${consume}
      ${census}
      ${sync}
    }
    module.exports = { OrderManager };
  `;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    window: global.window || (global.window = {}),
    console,
    Object,
    Number,
    String,
    Array,
    Map,
    Date,
    Math,
  }, { filename: 'a2-om-slice.js' });
  return module.exports;
}

test('A2 source: CI gate wired and order-manager mirrors byte-identical', () => {
  const pkg = JSON.parse(read(packageJsonPath));
  assert.equal(typeof pkg.scripts['test:a2-resolvebar-transcript'], 'string');
  assert.equal(typeof pkg.scripts['preflight:a2-resolvebar-transcript'], 'string');
  assert.equal(sha(read(chartOmPath)), sha(read(homeOmPath)));
  const om = read(chartOmPath);
  assert.match(om, /resolveBar\(/);
  assert.match(om, /_censusRetainedBarCloseTranscripts\(/);
  assert.match(om, /_syncBarCloseTranscriptForCandle\(/);
  assert.match(om, /_resolveBarSource/);
});

test('A2 product: resolveBar reads provided series, never animatingCandle object', () => {
  const { OrderManager } = loadOrderManagerClass();
  const om = new OrderManager();
  const series = [
    { t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
    { t: 2000, o: 1.5, h: 2.5, l: 1.0, c: 2.0, v: 10 },
  ];
  const fakeAnimating = { t: 2000, o: 9, h: 9, l: 9, c: 9, v: 1, animating: true };
  om.chart = {
    replaySystem: {
      fullRawData: series,
      animatingCandle: fakeAnimating,
      replayTimestamp: 2000,
    },
    rawData: series,
  };
  const bar = om.resolveBar(2000, { series });
  assert.ok(bar);
  assert.equal(bar.c, 2.0);
  assert.notEqual(bar.c, fakeAnimating.c);
  assert.equal(bar._resolveBarSource, 'raw_or_retained');
});

test('A2 product: bar-close transcript census drops prior bar at boundary', () => {
  const { OrderManager } = loadOrderManagerClass();
  const om = new OrderManager();
  const bar1 = { t: 1000, c: 1, _orderLifecycleEventKey: 'replay:1000' };
  const bar2 = { t: 2000, c: 2, _orderLifecycleEventKey: 'replay:2000' };

  om._syncBarCloseTranscriptForCandle(bar1);
  om._recordBarCloseTranscriptEvent('pending_eval', { barT: 1000 });
  assert.equal(om._censusRetainedBarCloseTranscripts().retained, 1);

  om._syncBarCloseTranscriptForCandle(bar2);
  const census = om._censusRetainedBarCloseTranscripts();
  assert.equal(census.retained, 1, 'prior bar transcript must be dropped at boundary');
  assert.equal(String(census.keys[0]), 'replay:2000');

  const consumed = om._consumeBarCloseTranscript('replay:2000');
  assert.ok(consumed);
  assert.equal(om._censusRetainedBarCloseTranscripts().retained, 0);
});

test('A2 RED mutant: retained transcript after boundary fails census expectation', () => {
  const { OrderManager } = loadOrderManagerClass();
  const om = new OrderManager();
  om._barCloseTranscripts = new Map([
    ['replay:1000', { events: [{ type: 'x' }] }],
    ['replay:2000', { events: [{ type: 'y' }] }],
  ]);
  om._barCloseTranscriptActiveKey = 'replay:2000';
  const census = om._censusRetainedBarCloseTranscripts();
  assert.ok(census.retained >= 2, 'mutant retains prior transcript');
  assert.notEqual(census.retained, 1);
});
