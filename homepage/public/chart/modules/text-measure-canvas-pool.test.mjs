import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const root = findRoot(__dirname);
const chartPath = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/modules/drawing-tools-text.js');
const homepagePath = path.resolve(findRoot(__dirname), 'homepage/public/chart/modules/drawing-tools-text.js');
const source = fs.readFileSync(chartPath, 'utf8');
const homepageSource = fs.readFileSync(homepagePath, 'utf8');

function extractHelperBlock(text) {
  const start = text.indexOf('let _drawingTextMeasureCanvas = null;');
  const end = text.indexOf('/** Apply resolved font family', start);
  assert.notEqual(start, -1, 'ANCHOR_BROKEN: missing text-measure canvas pool state');
  assert.notEqual(end, -1, 'ANCHOR_BROKEN: missing text-measure helper end anchor');
  return text.slice(start, end);
}

function runScenario({ killSwitch = false, text = source } = {}) {
  const created = [];
  const sandbox = {
    console,
    window: killSwitch
      ? { __TALARIA_DISABLE_TEXT_MEASURE_CANVAS_POOL_V1: true }
      : {},
    document: {
      createElement(name) {
        assert.equal(name, 'canvas');
        const canvas = {
          width: 300,
          height: 150,
          getContext(type) {
            assert.equal(type, '2d');
            return { canvas, id: created.length };
          },
        };
        created.push(canvas);
        return canvas;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${extractHelperBlock(text)}
globalThis.__first = getDrawingTextMeasureContext();
globalThis.__second = getDrawingTextMeasureContext();
globalThis.__poolCanvas = _drawingTextMeasureCanvas;
`, sandbox);
  return {
    created,
    first: sandbox.__first,
    second: sandbox.__second,
    poolCanvas: sandbox.__poolCanvas,
  };
}

test('text-measure canvas pool is mirrored byte-identically', () => {
  assert.equal(homepageSource, source);
});

test('default path reuses one 1x1 canvas context', () => {
  const result = runScenario();
  assert.equal(result.created.length, 1);
  assert.equal(result.first, result.second);
  assert.equal(result.poolCanvas.width, 1);
  assert.equal(result.poolCanvas.height, 1);
});

test('kill switch restores fresh canvas measurement behavior', () => {
  const result = runScenario({ killSwitch: true });
  assert.equal(result.created.length, 2);
  assert.notEqual(result.first, result.second);
});

test('mutant that disables pooling goes red on the default arm', () => {
  const mutant = source.replace(
    /function isDrawingTextMeasureCanvasPoolEnabled\(\) \{[\s\S]*?\n\}/,
    'function isDrawingTextMeasureCanvasPoolEnabled() { return false; }'
  );
  assert.throws(
    () => {
      const result = runScenario({ text: mutant });
      assert.equal(result.created.length, 1);
    },
    /Expected values to be strictly equal/
  );
});
