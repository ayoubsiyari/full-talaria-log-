import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const chartReplayPath = path.join(repoRoot, 'chart v 1.4/chart/modules/replay-system.js');
const homeReplayPath = path.join(repoRoot, 'homepage/public/chart/modules/replay-system.js');
const chartBridgePath = path.join(repoRoot, 'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js');
const homeBridgePath = path.join(repoRoot, 'homepage/public/chart/multichart-prod/panel-cmd-bridge.js');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function methodSource(text, name) {
  let start = text.indexOf(`    ${name}(`);
  if (start < 0) start = text.indexOf(`\n${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const sigEnd = text.indexOf(') {', start);
  assert.notEqual(sigEnd, -1, `${name} must have a method body`);
  const brace = sigEnd + 2;
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

function ownerModel(chart, opts = {}) {
  const mode = opts.centerPlayhead ? 'center' : (opts.mode || 'follow');
  const bar = chart.data.at(-1)?.t ?? 0;
  const offsetX = Math.round(opts.offsetX);
  const key = `${mode}:${bar}`;
  const last = chart._replayViewportOriginOwnerLast;
  if (opts.force !== true && last && last.key === key && last.offsetX === offsetX) return false;
  chart.offsetX = offsetX;
  chart._replayViewportOriginOwnerLast = { key, offsetX, source: opts.source || mode };
  chart._replayViewportOriginOwnerWrites = (chart._replayViewportOriginOwnerWrites | 0) + 1;
  return true;
}

test('DEF-02 source: sync and follow paths route through the viewport-origin owner', () => {
  for (const [label, replayText, bridgeText] of [
    ['chart', read(chartReplayPath), read(chartBridgePath)],
    ['homepage', read(homeReplayPath), read(homeBridgePath)],
  ]) {
    const sync = methodSource(replayText, 'syncReplayViewportToPlayhead');
    assert.match(sync, /_applyReplayViewportOrigin\(chartInstance/,
      `${label}: syncReplayViewportToPlayhead must call the owner`);
    assert.doesNotMatch(sync, /chartInstance\.offsetX\s*=/,
      `${label}: syncReplayViewportToPlayhead must not write offsetX directly`);

    const resolver = methodSource(replayText, '_resolveReplayViewportOrigin');
    assert.match(resolver, /Math\.round\(offsetX\)/, `${label}: owner must integer-snap origins`);
    const owner = methodSource(replayText, '_applyReplayViewportOrigin');
    assert.match(owner, /_replayViewportOriginOwnerLast/, `${label}: owner must remember last applied bar`);
    assert.match(owner, /opts\.force\s*!==\s*true/, `${label}: owner must allow forced catch-up recenter`);

    assert.match(replayText, /_applyReplayViewportOrigin\(this\.chart,\s*\{\s*source:\s*'updateChartData'/,
      `${label}: follow-mode updateChartData must use the owner`);
    assert.match(bridgeText, /_applyReplayViewportOrigin\(ch,\s*\{\s*offsetX:\s*easedOffsetX/,
      `${label}: same-TF eased panel follow must use the owner`);
    assert.match(bridgeText, /_applyReplayViewportOrigin\(ch,\s*\{\s*offsetX:\s*followSt\.offsetX/,
      `${label}: same-TF fallback follow must use the owner`);
  }
});

test('DEF-02 mirrors stay byte-identical for replay and panel bridge', () => {
  assert.equal(read(homeReplayPath), read(chartReplayPath));
  assert.equal(read(homeBridgePath), read(chartBridgePath));
});

test('DEF-02 owner model: one integer-snapped write per applied bar', () => {
  const chart = { data: [{ t: 1000 }], offsetX: 0 };
  assert.equal(ownerModel(chart, { offsetX: -12.4, source: 'follow' }), true);
  assert.equal(chart.offsetX, -12);
  assert.equal(chart._replayViewportOriginOwnerWrites, 1);

  assert.equal(ownerModel(chart, { offsetX: -12.4, source: 'duplicate-follow' }), false);
  assert.equal(chart._replayViewportOriginOwnerWrites, 1);

  chart.data.push({ t: 2000 });
  assert.equal(ownerModel(chart, { offsetX: -12.4, source: 'next-bar' }), true);
  assert.equal(chart._replayViewportOriginOwnerWrites, 2);
});

test('DEF-02 owner model: blue catch-up can force the same owner path', () => {
  const chart = { data: [{ t: 1000 }], offsetX: 0 };
  assert.equal(ownerModel(chart, { offsetX: 25.5, source: 'follow' }), true);
  assert.equal(ownerModel(chart, { offsetX: 25.5, source: 'blue-catch-up', force: true }), true);
  assert.equal(chart.offsetX, 26);
  assert.equal(chart._replayViewportOriginOwnerWrites, 2);
  assert.equal(chart._replayViewportOriginOwnerLast.source, 'blue-catch-up');
});
