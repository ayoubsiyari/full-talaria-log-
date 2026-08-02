import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chartRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(chartRoot, '..', '..');
const chartJsPath = path.join(chartRoot, 'chart.js');
const homepageChartJsPath = path.join(repoRoot, 'homepage', 'public', 'chart', 'chart.js');

const chartJs = readFileSync(chartJsPath, 'utf8');
const homepageChartJs = readFileSync(homepageChartJsPath, 'utf8');

function count(text, needle) {
  return text.split(needle).length - 1;
}

function methodSource(text, name) {
  const marker = `    ${name}(`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `missing method ${name}`);
  const sigEnd = text.indexOf(') {', start);
  assert.notEqual(sigEnd, -1, `missing method body ${name}`);
  let depth = 0;
  for (let i = sigEnd + 2; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated method ${name}`);
}

test('QW-4 source: chart.js mirrors stay byte-identical', () => {
  assert.equal(homepageChartJs, chartJs);
});

test('QW-4 source: HUD is default-off and switch-gated', () => {
  assert.equal(count(chartJs, "const QW4_SOAK_HUD_SWITCH = '__TALARIA_QW4_SOAK_HUD_V1';"), 1);
  assert.equal(count(chartJs, 'function _talariaQw4SoakHudEnabled()'), 1);
  assert.match(chartJs, /const QW4_SOAK_HUD_SWITCH = '__TALARIA_QW4_SOAK_HUD_V1';/);
  assert.match(chartJs, /w\[QW4_SOAK_HUD_SWITCH\] === true/);
  assert.match(chartJs, /this\._ensureQw4SoakDiagnosticsHud\(\);/);

  const ensure = methodSource(chartJs, '_ensureQw4SoakDiagnosticsHud');
  assert.match(ensure, /if \(!this\._qw4SoakHudHostSurface\(\)\) return null;/);
  assert.match(ensure, /window\.__talariaQw4SoakHudOwner/);
  assert.match(ensure, /document\.createElement\('section'\)/);
  assert.match(ensure, /setInterval\(\(\) => this\._updateQw4SoakDiagnosticsHud\(\), 2000\)/);
});

test('QW-4 source: headline rate uses E RATE-HOLD timestamp route', () => {
  const route = methodSource(chartJs, '_qw4ReadTimestampRouteBarsPerSecond');
  assert.match(route, /replayTimestamp/);
  assert.match(route, /_resolveReplayStepTimeframeMs/);
  assert.match(route, /'replayTimestamp'/);
  assert.match(route, /currentIndex/);
  assert.match(route, /__talariaEffectiveRate/);

  const snapshot = methodSource(chartJs, '_qw4ReadSoakDiagnosticsSnapshot');
  assert.match(snapshot, /_qw4ReadTimestampRouteBarsPerSecond/);
  assert.match(snapshot, /barsPerSecRoute/);
  assert.match(snapshot, /timestampDeltaMs/);
  assert.match(snapshot, /indexBarsPerSecWitness/);
  assert.match(snapshot, /speedGovEffectiveWitness/);
  assert.match(snapshot, /effectiveBarsPerSecond/);
  assert.match(snapshot, /targetBarsPerSecond/);
  assert.match(snapshot, /baselineBarsPerSecond/);
  assert.match(snapshot, /rateHoldPct/);
  assert.match(snapshot, /rateHoldOk: rateHoldPct == null \? null : rateHoldPct <= 5/);
  assert.match(snapshot, /heapMiB/);
  assert.match(snapshot, /frameIntervalMs/);
  assert.match(snapshot, /restoreCatchTotal/);
  // Headline must prefer timestamp route over speed-gov witness.
  assert.match(snapshot, /Number\.isFinite\(routeSample\.effective\)/);
});

test('QW-4 source: human HUD renders every STOPWATCH-01 metric with route label', () => {
  const update = methodSource(chartJs, '_updateQw4SoakDiagnosticsHud');
  assert.match(chartJs, /SOAK HUD/);
  assert.match(chartJs, /data-qw4="rate"/);
  assert.match(chartJs, /data-qw4="hold"/);
  assert.match(chartJs, /data-qw4="heap"/);
  assert.match(chartJs, /data-qw4="frame"/);
  assert.match(chartJs, /data-qw4="catches"/);
  assert.match(update, /window\.__talariaQw4SoakHudSnapshot = snap/);
  assert.match(update, /barsPerSecRoute/);
  assert.match(update, /talaria-qw4-soak-hud__bad/);
  assert.match(update, /talaria-qw4-soak-hud__ok/);
});
