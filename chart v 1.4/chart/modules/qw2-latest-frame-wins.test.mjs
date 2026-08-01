import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const chartBridgePath = path.join(repoRoot, 'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js');
const homeBridgePath = path.join(repoRoot, 'homepage/public/chart/multichart-prod/panel-cmd-bridge.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
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

function makeSlot() {
  let latestFrame = null;
  const applied = [];
  return {
    schedule(args) {
      latestFrame = { args: { ...args }, instant: false };
    },
    instant(args) {
      latestFrame = { args: { ...args }, instant: true };
      this.flush();
    },
    flush() {
      if (!latestFrame) return;
      const frame = latestFrame;
      latestFrame = null;
      applied.push(frame.args.timestamp);
    },
    applied,
  };
}

test('QW-2 source: bridge owns one latestFrame slot behind __TALARIA_LATEST_WINS_V1', () => {
  for (const [label, text] of [
    ['chart', read(chartBridgePath)],
    ['homepage', read(homeBridgePath)],
  ]) {
    assert.match(text, /var latestFrame = null;/, `${label}: latestFrame slot missing`);
    const enabled = functionSource(text, 'latestWinsEnabled');
    assert.match(enabled, /__TALARIA_LATEST_WINS_V1/, `${label}: switch missing`);
    assert.match(enabled, /=== false/, `${label}: explicit false must be rollback`);

    const schedule = functionSource(text, 'scheduleCoalescedReplayFrameApply');
    assert.match(schedule, /latestFrame = \{ args: Object\.assign\(\{\}, args \|\| \{\}\), instant: false \}/,
      `${label}: scheduled frames must overwrite the latest slot`);
    assert.match(schedule, /coalescedReplayFrameArgs = latestFrame\.args/,
      `${label}: legacy arg slot must mirror latestFrame`);

    const instant = functionSource(text, 'applyLatestFrameInstant');
    assert.match(instant, /latestFrame = \{ args: Object\.assign\(\{\}, args \|\| \{\}\), instant: true \}/,
      `${label}: catch-up snap must use latestFrame`);
    assert.match(instant, /flushCoalescedReplayFrameApply\(\)/,
      `${label}: instant catch-up must flush through replay-frame apply`);

    const catchUp = functionSource(text, 'scheduleMirrorCatchUp');
    assert.match(catchUp, /applyLatestFrameInstant\(buildPayload\(\)\)/,
      `${label}: catch-up must route through latestFrame instant snap`);
  }
});

test('QW-2 mirrors stay byte-identical for panel bridge', () => {
  assert.equal(read(homeBridgePath), read(chartBridgePath));
});

test('QW-2 model: new frames overwrite unapplied old frames', () => {
  const slot = makeSlot();
  slot.schedule({ timestamp: 1000 });
  slot.schedule({ timestamp: 2000 });
  slot.schedule({ timestamp: 3000 });
  slot.flush();
  assert.deepEqual(slot.applied, [3000]);
});

test('QW-2 model: catch-up snap flushes through the same latestFrame slot', () => {
  const slot = makeSlot();
  slot.schedule({ timestamp: 1000 });
  slot.instant({ timestamp: 9000 });
  slot.flush();
  assert.deepEqual(slot.applied, [9000]);
});
