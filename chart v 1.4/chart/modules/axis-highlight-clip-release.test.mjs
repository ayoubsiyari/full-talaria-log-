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
const chartPath = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/modules/drawing-tools-base.js');
const homepagePath = path.resolve(findRoot(__dirname), 'homepage/public/chart/modules/drawing-tools-base.js');
const source = fs.readFileSync(chartPath, 'utf8');
const homepageSource = fs.readFileSync(homepagePath, 'utf8');

function extractMethod(text, name) {
  const start = text.indexOf(`    ${name}(`);
  assert.notEqual(start, -1, `ANCHOR_BROKEN: missing ${name}`);
  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1).trim();
  }
  assert.fail(`ANCHOR_BROKEN: unterminated ${name}`);
}

function extractFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `ANCHOR_BROKEN: missing ${name}`);
  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  assert.fail(`ANCHOR_BROKEN: unterminated ${name}`);
}

function runHide({ killSwitch = false, text = source } = {}) {
  const removed = [];
  const sandbox = {
    console,
    window: killSwitch
      ? { __TALARIA_DISABLE_AXIS_HIGHLIGHT_CLIP_RELEASE_V1: true }
      : {},
  };
  vm.createContext(sandbox);
  vm.runInContext(`
${extractFunction(text, '_isAxisHighlightClipReleaseEnabled')}
const api = { ${extractMethod(text, 'hideAxisHighlights')} };
const svg = {
  selectAll(selector) { return { remove() { removed.push(['all', selector]); } }; },
  select(selector) { return { remove() { removed.push(['one', selector]); } }; },
};
const removed = globalThis.__removed = [];
api.hideAxisHighlights.call({
  id: 'draw-123',
  chart: { svg },
  axisHighlightGroup: { remove() { removed.push(['group', 'axis']); } },
  _labelGroup: { remove() { removed.push(['group', 'label']); } },
});
`, sandbox);
  return sandbox.__removed;
}

test('axis-highlight clip release is mirrored byte-identically', () => {
  assert.equal(homepageSource, source);
});

test('default cleanup removes the owned axis-highlight clipPath', () => {
  const removed = runHide();
  assert.ok(removed.some((row) => row[0] === 'one' && row[1] === '#axis-highlight-clip-draw-123'));
});

test('kill switch preserves legacy clipPath retention', () => {
  const removed = runHide({ killSwitch: true });
  assert.equal(removed.some((row) => row[0] === 'one' && row[1] === '#axis-highlight-clip-draw-123'), false);
});

test('mutant without clipPath removal goes red on default cleanup', () => {
  const mutant = source.replace(
    "this.chart.svg.select(`#axis-highlight-clip-${this.id}`).remove();",
    '/* mutant: clipPath removal dropped */'
  );
  assert.throws(() => {
    const removed = runHide({ text: mutant });
    assert.ok(removed.some((row) => row[0] === 'one' && row[1] === '#axis-highlight-clip-draw-123'));
  });
});
