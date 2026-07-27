import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const modulesDir = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(modulesDir, '..');
const repoRoot = path.resolve(chartRoot, '..', '..');

const pairs = [
  [
    path.join(chartRoot, 'multichart', 'multichart-manager.js'),
    path.join(repoRoot, 'homepage', 'public', 'chart', 'multichart', 'multichart-manager.js'),
  ],
  [
    path.join(chartRoot, 'multichart-prod', 'multichart-manager.js'),
    path.join(repoRoot, 'homepage', 'public', 'chart', 'multichart-prod', 'multichart-manager.js'),
  ],
];
const runtimePairs = [
  [
    path.join(chartRoot, 'multichart-prod', 'panel-cmd-bridge.js'),
    path.join(repoRoot, 'homepage', 'public', 'chart', 'multichart-prod', 'panel-cmd-bridge.js'),
  ],
];

test('b70 manager canonical/homepage mirror pairs are byte-identical', () => {
  for (const [canonical, homepage] of pairs) {
    const canonicalBytes = fs.readFileSync(canonical);
    const homepageBytes = fs.readFileSync(homepage);
    assert.deepEqual(homepageBytes, canonicalBytes, `${homepage} diverged from ${canonical}`);

    const source = canonicalBytes.toString('utf8');
    assert.match(source, /__TALARIA_B70_CONNECT_INDICATOR_PANEL_V1/);
    assert.match(source, /_b70ShadowDisposeIndicatorGeneration/);
  }
});

test('multichart product runtime mirrors are byte-identical', () => {
  for (const [canonical, homepage] of runtimePairs) {
    assert.deepEqual(
      fs.readFileSync(homepage),
      fs.readFileSync(canonical),
      `${homepage} diverged from ${canonical}`,
    );
  }
});
