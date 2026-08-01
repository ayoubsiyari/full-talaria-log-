import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const chartReplayPath = path.join(repoRoot, 'chart v 1.4/chart/modules/replay-system.js');
const homeReplayPath = path.join(repoRoot, 'homepage/public/chart/modules/replay-system.js');
const chartBridgePath = path.join(repoRoot, 'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js');
const homeBridgePath = path.join(repoRoot, 'homepage/public/chart/multichart-prod/panel-cmd-bridge.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function methodSource(text, name) {
  const start = text.indexOf(`${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = text.indexOf('{', start);
  assert.notEqual(brace, -1, `${name} must have a body`);
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

function functionSource(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = text.indexOf('{', start);
  assert.notEqual(brace, -1, `${name} must have a body`);
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

function makeSeries(stepMs, count, start = 1_700_000_000_000) {
  return Array.from({ length: count }, (_, i) => ({ t: start + i * stepMs }));
}

function indexAtOrBefore(series, ts) {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= ts) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

test('DEF-04 source: replay mirror payloads do not propagate parent currentIndex', () => {
  for (const [label, replayText, bridgeText] of [
    ['chart', read(chartReplayPath), read(chartBridgePath)],
    ['homepage', read(homeReplayPath), read(homeBridgePath)],
  ]) {
    const buildDetail = methodSource(replayText, '_buildMultichartReplayFrameDetail');
    assert.doesNotMatch(buildDetail, /currentIndex\s*:\s*this\.currentIndex/,
      `${label}: replay frame detail must not export bar index`);

    const mirrorFrame = methodSource(replayText, '_tryMirrorFrameFromParentData');
    assert.doesNotMatch(mirrorFrame, /detail\s*&&\s*detail\.currentIndex/,
      `${label}: mirror frame must not read parent index`);
    assert.match(mirrorFrame, /_findLastRawIndexAtOrBefore\(this\.fullRawData,\s*ts\)/,
      `${label}: mirror frame resolves timestamp to local index`);

    const forceMirror = functionSource(bridgeText, 'forceSamePairParentDataMirror');
    assert.doesNotMatch(forceMirror, /payload\.currentIndex\s*=/,
      `${label}: bridge must not inject host currentIndex`);
    assert.doesNotMatch(forceMirror, /\.currentIndex\s*=\s*prs\.currentIndex/,
      `${label}: bridge fallback must not copy host currentIndex`);
    assert.match(forceMirror, /syncCurrentIndexFromReplayTimestamp\(rs\.replayTimestamp\)/,
      `${label}: bridge fallback resolves local index by epoch`);
  }
});

test('DEF-04 mirrors stay byte-identical for replay and panel bridge', () => {
  const chartReplay = read(chartReplayPath);
  const homeReplay = read(homeReplayPath);
  const chartBridge = read(chartBridgePath);
  const homeBridge = read(homeBridgePath);
  assert.equal(homeReplay, chartReplay, `replay mirror mismatch ${sha(chartReplay)} ${sha(homeReplay)}`);
  assert.equal(homeBridge, chartBridge, `bridge mirror mismatch ${sha(chartBridge)} ${sha(homeBridge)}`);
});

test('DEF-04 oracle: four panels resolve one epoch playhead to local bar indices', () => {
  const minute = 60_000;
  const panels = [
    { tf: '1m', step: minute, data: makeSeries(minute, 600) },
    { tf: '15m', step: 15 * minute, data: makeSeries(15 * minute, 80) },
    { tf: '1h', step: 60 * minute, data: makeSeries(60 * minute, 30) },
    { tf: '4h', step: 240 * minute, data: makeSeries(240 * minute, 10) },
  ];

  const start = panels[0].data[0].t;
  for (const source of panels) {
    const targetTs = start + source.step;
    const resolved = Object.fromEntries(
      panels.map((panel) => [panel.tf, indexAtOrBefore(panel.data, targetTs)]),
    );
    assert.equal(resolved['1m'], Math.floor(source.step / minute),
      `${source.tf} advance must move 1m by equal elapsed time`);
    assert.equal(resolved['15m'], Math.floor(source.step / (15 * minute)));
    assert.equal(resolved['1h'], Math.floor(source.step / (60 * minute)));
    assert.equal(resolved['4h'], Math.floor(source.step / (240 * minute)));
  }
});

test('DEF-04 oracle: a 4h source advance is expressible as 240 governed 1m steps', () => {
  const minute = 60_000;
  const start = 1_700_000_000_000;
  const end = start + 240 * minute;
  const steps = [];
  for (let ts = start + minute; ts <= end; ts += minute) steps.push(ts);
  assert.equal(steps.length, 240);
  assert.equal(steps[0], start + minute);
  assert.equal(steps[steps.length - 1], end);
});
