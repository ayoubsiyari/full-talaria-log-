/**
 * FORMING-01 — forming-bar renderer rides the replay step clock and dirty path.
 *
 *   node --test --test-concurrency=1 "chart v 1.4/chart/modules/forming-renderer-step-clock.test.mjs"
 *
 * A5 wiring: product writes carry a SIM tag, playback paint is dirty-scheduled,
 * and mirrors are byte-identical. A7 boundary correctness stays in
 * m17-di2-completed-bar-guard.test.mjs, which exercises forming vs completed bars.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

function occurrences(text, needle) {
  const out = [];
  let at = text.indexOf(needle);
  while (at >= 0) {
    out.push(at);
    at = text.indexOf(needle, at + needle.length);
  }
  return out;
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const REPLAY = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const REPLAY_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');

const chartSource = fs.readFileSync(CHART, 'utf8');
const chartMirrorSource = fs.readFileSync(CHART_MIRROR, 'utf8');
const replaySource = fs.readFileSync(REPLAY, 'utf8');
const replayMirrorSource = fs.readFileSync(REPLAY_MIRROR, 'utf8');

test('A5 product wiring: forming SIM tag is present in canonical and mirror files', () => {
  for (const [label, source] of [
    ['chart', chartSource],
    ['chart mirror', chartMirrorSource],
    ['replay', replaySource],
    ['replay mirror', replayMirrorSource],
  ]) {
    assert.match(source, /__talariaFormingSim/, `${label} must carry the SIM tag`);
    assert.match(source, /__talariaFormingSimSource/, `${label} must name the forming source`);
  }
  assert.equal(chartSource, chartMirrorSource, 'chart mirror must be byte-identical');
  assert.equal(replaySource, replayMirrorSource, 'replay mirror must be byte-identical');
});

test('A5 product wiring: interpolation is derived from the step clock helper', () => {
  const helper = methodSource(replaySource, '_deriveStepClockFormingCandle');
  const animateTick = methodSource(replaySource, 'animateTick');
  const frameDetail = methodSource(replaySource, '_buildMultichartReplayFrameDetail');

  assert.match(helper, /Number\(this\.tickProgress\)/, 'helper must read step-clock progress');
  assert.match(helper, /target\.cachedPath = this\.getRetainedTickPath\(tc,\s*'animatingCandle'\)/,
    'helper derives deterministic price path into a retained slot');
  assert.match(helper, /__talariaFormingSimSource\s*=\s*'step-clock'/, 'helper stamps SIM source');
  assert.match(helper, /this\._formingCandleScratch/, 'helper must reuse per-panel scratch');
  assert.doesNotMatch(helper, /new Array|\[\.\.\.|\.slice\s*\(|Array\.from\s*\(/,
    'renderer helper must not allocate arrays or copy waypoint buffers');
  assert.match(animateTick, /this\._deriveStepClockFormingCandle\(target,\s*ticksNeeded\)/);
  assert.doesNotMatch(animateTick, /const tc = target\.target/, 'tick derivation must not stay inline');
  assert.match(frameDetail, /__talariaFormingSimSource\s*=\s*ac\.__talariaFormingSimSource \|\| 'step-clock'/);
  assert.match(frameDetail, /detail\.animatedCandle = frame/, 'frame payload must consume scratch object');
  assert.doesNotMatch(frameDetail, /detail\.animatedCandle = \{\s*t:/,
    'frame payload must not copy forming candle into a per-frame object');

  for (const driver of [/\bsetInterval\s*\(/, /\bsetTimeout\s*\(/, /\brequestAnimationFrame\s*\(/]) {
    assert.doesNotMatch(helper, driver, 'step-clock helper must not install a driver');
  }
});

test('skip-to-bar-close collapses remaining waypoints without re-resolving', () => {
  const skipToClose = methodSource(replaySource, 'skipToBarClose');
  assert.match(skipToClose, /this\.tickProgress = ticksNeeded/, 'cursor snaps to boundary tick');
  assert.match(skipToClose, /this\._deriveStepClockFormingCandle\(target,\s*ticksNeeded\)/);
  assert.match(skipToClose, /this\.completeTickAnimation\(\)/, 'bar close commits through existing completion path');
  assert.ok(
    skipToClose.indexOf('this._deriveStepClockFormingCandle') < skipToClose.indexOf('this.completeTickAnimation()'),
    'skip must derive boundary state before completing the bar',
  );
  assert.doesNotMatch(skipToClose, /getTickPath|generateRandomPath|startTickAnimation|scheduleNextTick/,
    'skip-to-close must not re-resolve waypoints or install another driver');
});

test('A5 product wiring: replay/forming paints are dirty-scheduled while playing', () => {
  const replayUpdate = methodSource(replaySource, '_renderReplayChartUpdate');
  assert.match(replayUpdate, /_requestRafPaint\(\{\s*flush:\s*!this\.isPlaying\s*\}\)/);
  assert.match(replayUpdate, /!this\.isPlaying\s*&&\s*typeof chart\.render === 'function'/);

  const animatedPanelSync = methodSource(replaySource, 'syncPanelChartsWithAnimatedCandle');
  assert.match(animatedPanelSync, /pc\._requestRafPaint\(\)/);
  assert.doesNotMatch(animatedPanelSync, /if\s*\(pc\.render\)\s*pc\.render\(\)/);

  const mirrorFinish = methodSource(replaySource, '_finishMultichartMirrorRender');
  assert.match(mirrorFinish, /const shouldUseDirtyPaint = passivePlay \|\| lightPass \|\| this\.isPlaying/);
  assert.match(mirrorFinish, /if \(!shouldUseDirtyPaint\) chart\.render\(\)/);
});

test('no-stacking: forming renderer introduced no dedicated timer or rAF loop', () => {
  const combined = `${chartSource}\n${replaySource}`;
  for (const at of occurrences(combined, '__talariaFormingSim')) {
    const snippet = combined.slice(Math.max(0, at - 300), at + 300);
    assert.doesNotMatch(snippet, /\bsetInterval\s*\(/, 'forming tag path must not install an interval');
    assert.doesNotMatch(snippet, /\bsetTimeout\s*\(/, 'forming tag path must not install a timeout');
    assert.doesNotMatch(snippet, /\brequestAnimationFrame\s*\(/, 'forming tag path must not install rAF');
  }
});

test('A7 boundary anchors: SIM tag happens after completed-bar guard', () => {
  const chartHelper = methodSource(chartSource, '_applyCanonicalMarkToFormingBar');
  assert.match(chartHelper, /playhead\s*>=\s*periodEnd\s*-\s*1/);
  assert.ok(
    chartHelper.indexOf('if (Number.isFinite(playhead)') < chartHelper.indexOf('last.__talariaFormingSim = true'),
    'chart helper must decide completed-vs-forming before tagging SIM',
  );

  const animatedHelperStart = replaySource.indexOf('function applyAnimatedCandleToFormingBar(chart, animatedCandle)');
  assert.notEqual(animatedHelperStart, -1, 'animated helper must exist');
  const animatedHelper = replaySource.slice(animatedHelperStart, replaySource.indexOf('\n}', animatedHelperStart) + 2);
  assert.ok(
    animatedHelper.indexOf('if (_shouldSkipCompletedBarCloseWrite(chart)) return;')
      < animatedHelper.indexOf('last.__talariaFormingSim = true'),
    'animated helper must skip completed bars before tagging SIM',
  );
});
