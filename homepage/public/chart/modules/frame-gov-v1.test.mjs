/**
 * FRAME-01: frame governor cadence.
 *
 *   node --test --test-concurrency=1 "chart v 1.4/chart/modules/frame-gov-v1.test.mjs"
 *
 * Switch: window.__TALARIA_FRAME_GOV_V1
 *   absent / non-false = governor ON. Explicit false = rollback.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_FRAME_GOV_V1';

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

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');
const MIRROR_SOURCE = fs.readFileSync(CHART_MIRROR, 'utf8');

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0].replace(/\n+$/, '\n');
}

function makeHarness({
  ownId = 'A',
  focusedId = 'A',
  switchValue,
  inputFast = false,
  pendingCrosshair = false,
} = {}) {
  let now = 1000;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    requestAnimationFrame() { return 1; },
    performance: { now: () => now },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.window.parent = sandbox.window;
  sandbox.window.top = sandbox.window;
  if (switchValue !== undefined) sandbox.window[SWITCH] = switchValue;
  vm.createContext(sandbox);

  const body = [
    methodSource(SOURCE, '_frameGovEnabled'),
    methodSource(SOURCE, '_frameGovInputFastPathActive'),
    methodSource(SOURCE, '_frameGovPaintIntervalMs'),
    methodSource(SOURCE, '_frameGovShouldPaint'),
    methodSource(SOURCE, '_frameGovRecordPaint'),
    methodSource(SOURCE, 'animate'),
  ].join('\n');

  vm.runInContext(`
const FRAME_GOV_SWITCH = '${SWITCH}';
const FRAME_GOV_FOCUSED_INTERVAL_MS = 1000 / 30;
const FRAME_GOV_NONFOCUSED_INTERVAL_MS = 1000 / 15;
class Chart {
    constructor() {
        this.renderPending = false;
        this._frameGovLastPaintAt = 0;
        this.paintCount = 0;
        this._inputFast = ${inputFast ? 'true' : 'false'};
        this._pendingCrosshairMoveEvent = ${pendingCrosshair ? '{}' : 'null'};
        this._crosshairTooltipRaf = null;
        this.replaySystem = { updateAutoScrollIndicator() {} };
        this._lastFollowBtnCheck = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.fpsUpdateInterval = 500;
        this.fps = 0;
        this._animateBound = () => {};
    }
    _getMultichartPanelId() { return ${JSON.stringify(ownId)}; }
    _getFocusedMultichartPanelId() { return ${JSON.stringify(focusedId)}; }
    _isInteractionFastRender() { return this._inputFast; }
    _isChartPanDragging() { return false; }
    animateZoom() {}
    _tickMultichartBackgroundRenderCatchup() {}
    _tickBarCloseCountdown() {}
    render() { this.paintCount += 1; }
${body}
}
globalThis.Chart = Chart;
`, sandbox);
  return {
    chart: new sandbox.Chart(),
    tick(ms) {
      now += ms;
      this.chart.animate();
    },
  };
}

test('FRAME-01 clean panel paints nothing while renderPending is false', () => {
  const h = makeHarness();
  for (let i = 0; i < 120; i += 1) h.tick(16);
  assert.equal(h.chart.paintCount, 0);
});

test('FRAME-01 focused panel is capped to 30fps by default', () => {
  const h = makeHarness({ ownId: 'A', focusedId: 'A' });
  h.chart.renderPending = true;
  h.tick(0);
  h.chart.renderPending = true;
  h.tick(16);
  h.chart.renderPending = true;
  h.tick(18);
  assert.equal(h.chart.paintCount, 2);
});

test('FRAME-01 non-focused panel is capped to 15fps by default', () => {
  const h = makeHarness({ ownId: 'B', focusedId: 'A' });
  h.chart.renderPending = true;
  h.tick(0);
  h.chart.renderPending = true;
  h.tick(34);
  h.chart.renderPending = true;
  h.tick(33);
  assert.equal(h.chart.paintCount, 2);
});

test('FRAME-01 input fast path bypasses fps cap', () => {
  const h = makeHarness({ ownId: 'A', focusedId: 'A', inputFast: true });
  h.chart.renderPending = true;
  h.tick(0);
  h.chart.renderPending = true;
  h.tick(16);
  assert.equal(h.chart.paintCount, 2);
});

test('FRAME-01 explicit false switch restores legacy every-frame dirty paint', () => {
  const h = makeHarness({ switchValue: false });
  h.chart.renderPending = true;
  h.tick(0);
  h.chart.renderPending = true;
  h.tick(16);
  assert.equal(h.chart.paintCount, 2);
});

test('FRAME-01 product markers are mirrored', () => {
  for (const needle of [
    'const FRAME_GOV_SWITCH =',
    '_frameGovEnabled()',
    '_frameGovInputFastPathActive()',
    '_frameGovShouldPaint(frameGovNow)',
    '__TALARIA_FRAME_GOV_V1',
  ]) {
    assert.equal(SOURCE.includes(needle), true, `${needle} missing from canonical`);
    assert.equal(MIRROR_SOURCE.includes(needle), true, `${needle} missing from mirror`);
  }
});
