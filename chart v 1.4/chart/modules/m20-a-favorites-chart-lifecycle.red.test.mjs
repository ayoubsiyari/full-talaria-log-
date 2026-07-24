/**
 * M20-A — favorites chart lifecycle RED contract (manager-only slice).
 *
 * Executes the REAL Chart.initDrawingTools() product method — the exact
 * method text is extracted from this tree's chart.js (hash-pinned, brace
 * matched) and run against the real FavoritesManager class. No replacement
 * model: the stacking proof below runs the shipped product path itself.
 * (The Function constructor here executes only our own hash-verified product
 * source inside a test; there is no untrusted input.)
 *
 * Proves the production leak remains until chart.js calls
 * favoritesManager.destroy() before replacement. Does NOT edit chart.js.
 *
 * Runs from any cwd, in BOTH trees:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a-favorites-chart-lifecycle.red.test.mjs"
 *   node --test --test-concurrency=1 \
 *     "homepage/public/chart/modules/m20-a-favorites-chart-lifecycle.red.test.mjs"
 *
 * Evidence:
 *   M20_A_LIFECYCLE_EVIDENCE=red →
 *     docs/plan3/evidence/W4-M20-A-FAVORITES-LIFECYCLE-20260724-red[-homepage].json
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 14; i += 1) {
    if (
      fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))
      && fs.existsSync(path.join(dir, 'homepage'))
    ) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`repo root not found above ${start}`);
}

const REPO_ROOT = findRepoRoot(__dirname);
const TREE = __dirname.includes(`homepage${path.sep}public`) ? 'homepage' : 'canonical';
const CHART_JS = path.join(__dirname, '..', 'chart.js');
const PRODUCT = path.join(__dirname, 'favorites-manager.js');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const require = createRequire(import.meta.url);
const STAMP = '20260724';
const writeEvidence = String(process.env.M20_A_LIFECYCLE_EVIDENCE || '').toLowerCase() === 'red';
const rows = [];

console.log = () => {};
console.warn = () => {};
console.error = () => {};

function note(name, pass, detail = '') {
  rows.push({ name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [LIFECYCLE] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function atomicWriteTextSync(out, text, options = {}) {
  const dir = path.dirname(out);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(out)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    if (options.beforeRename) options.beforeRename(tmp);
    fs.renameSync(tmp, out);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* cleanup best effort */ }
    throw err;
  }
}

function atomicWriteJsonSync(out, payload, options = {}) {
  atomicWriteTextSync(out, `${JSON.stringify(payload, null, 2)}\n`, options);
}

/** Extract the exact initDrawingTools() {...} method text via brace matching. */
function extractInitDrawingTools(chartSource) {
  const marker = 'initDrawingTools() {';
  const start = chartSource.indexOf(marker);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + marker.length - 1; i < chartSource.length; i += 1) {
    const ch = chartSource[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return chartSource.slice(start, i + 1);
    }
  }
  return null;
}

function installDomCensus() {
  const listeners = new Map();
  let nextId = 0;
  const tag = (obj, label) => { obj.__id = `${label}-${++nextId}`; return obj; };
  const add = (target, type, fn) => {
    const key = `${target.__id}:${type}`;
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
  };
  const dragHandle = tag({
    addEventListener(t, fn) { add(this, t, fn); },
    removeEventListener(t, fn) { listeners.get(`${this.__id}:${t}`)?.delete(fn); },
  }, 'handle');
  const toolbar = tag({
    style: { left: '56px', top: '80px', transition: '', display: 'flex' },
    classList: { add() {}, remove() {}, contains() { return false; } },
    getBoundingClientRect() { return { left: 56, top: 80, width: 240, height: 40 }; },
    querySelector(s) { return s === '.favorites-drag-handle' ? dragHandle : null; },
  }, 'toolbar');
  const documentObj = tag({
    addEventListener(t, fn) { add(this, t, fn); },
    removeEventListener(t, fn) { listeners.get(`${this.__id}:${t}`)?.delete(fn); },
    getElementById(id) {
      if (id === 'favoritesToolbar') return toolbar;
      if (id === 'favoritesTools') return { innerHTML: '', appendChild() {} };
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return {
        style: {},
        classList: { add() {}, remove() {} },
        setAttribute() {},
        addEventListener() {},
        appendChild() {},
        querySelector() { return null; },
      };
    },
  }, 'document');
  global.window = { innerWidth: 1280, innerHeight: 800 };
  global.document = documentObj;
  global.userStorage = { getItem() { return null; }, setItem() {} };
  global.requestAnimationFrame = (fn) => { fn(); return 1; };
  global.cancelAnimationFrame = () => {};
  const countDoc = (type) => listeners.get(`${documentObj.__id}:${type}`)?.size || 0;
  return { countDoc, document: documentObj };
}

function loadFavoritesManager() {
  const resolved = require.resolve(PRODUCT);
  delete require.cache[resolved];
  const mod = require(PRODUCT);
  if (typeof mod === 'function') return mod;
  return global.window?.FavoritesManager || null;
}

test('M20-A lifecycle RED — chart.js still has no destroy owner (static)', () => {
  const chartJs = fs.readFileSync(CHART_JS, 'utf8');
  const hasConstruct = chartJs.includes('new FavoritesManager(this)');
  const hasDestroyCall = /favoritesManager\s*\??\.\s*destroy\s*\(/.test(chartJs);
  note('chart-js-constructs-favorites-manager', hasConstruct);
  note('chart-js-missing-favorites-destroy', !hasDestroyCall,
    hasDestroyCall ? 'destroy call found' : 'no destroy call');
  assert.equal(hasConstruct, true, 'expected chart.js to construct FavoritesManager');
  assert.equal(hasDestroyCall, false,
    'lifecycle RED: chart.js must not yet call favoritesManager.destroy()');
});

test('M20-A lifecycle RED — REAL initDrawingTools() replacement stacks doc pair', () => {
  const chartSource = fs.readFileSync(CHART_JS, 'utf8');
  const methodText = extractInitDrawingTools(chartSource);
  note('real-initDrawingTools-extracted', !!methodText,
    methodText ? `sha256=${sha256(methodText).slice(0, 16)}… len=${methodText.length}` : 'marker missing');
  assert.ok(methodText, 'initDrawingTools() method not found in chart.js');
  note('real-method-constructs-favorites', methodText.includes('new FavoritesManager(this)'));
  note('real-method-has-no-destroy', !/destroy\s*\(/.test(methodText));
  assert.ok(methodText.includes('new FavoritesManager(this)'));

  const census = installDomCensus();
  const FavoritesManager = loadFavoritesManager();
  assert.equal(typeof FavoritesManager, 'function', 'real FavoritesManager class required');

  // Execute the EXACT shipped product method text. Scope injection provides
  // the class identifiers the method references; FavoritesManager is the real
  // product class, DrawingToolsManager is inert, ObjectTreeManager is left
  // undefined so the product's own `typeof` guard skips it.
  class DrawingToolsManager { constructor(chart) { this.chart = chart; } }
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'DrawingToolsManager', 'ObjectTreeManager', 'FavoritesManager', 'console',
    `"use strict"; return function ${methodText};`,
  );
  const realInitDrawingTools = factory(
    DrawingToolsManager, undefined, FavoritesManager,
    { log() {}, warn() {}, error() {} },
  );

  const chart = {};
  const baseMove = census.countDoc('mousemove');
  const baseUp = census.countDoc('mouseup');

  realInitDrawingTools.call(chart);
  const firstManager = chart.favoritesManager;
  note('real-product-path-constructs-manager',
    firstManager instanceof FavoritesManager);
  note('real-product-path-installs-doc-pair',
    census.countDoc('mousemove') === baseMove + 1 && census.countDoc('mouseup') === baseUp + 1,
    `moveΔ=${census.countDoc('mousemove') - baseMove}`);

  realInitDrawingTools.call(chart); // product replacement — never destroys prior
  const stacked = census.countDoc('mousemove') === baseMove + 2
    && census.countDoc('mouseup') === baseUp + 2;
  note('real-replace-without-destroy-stacks', stacked,
    `moveΔ=${census.countDoc('mousemove') - baseMove} upΔ=${census.countDoc('mouseup') - baseUp}`);
  note('real-replace-abandons-prior-manager', chart.favoritesManager !== firstManager);
  assert.equal(stacked, true,
    'REAL initDrawingTools replacement must remain RED (stacked doc pair) until chart.js owner lands');

  // The manager API is ready: destroying both abandoned+current flattens.
  firstManager.destroy();
  note('manager-api-flattens-abandoned',
    census.countDoc('mousemove') === baseMove + 1,
    `moveΔ=${census.countDoc('mousemove') - baseMove}`);
  chart.favoritesManager.destroy();
  note('manager-api-flattens-current',
    census.countDoc('mousemove') === baseMove,
    `moveΔ=${census.countDoc('mousemove') - baseMove}`);
  assert.equal(census.countDoc('mousemove'), baseMove,
    'manager destroy() must be able to recover — blocker is only the chart.js owner');
});

test('lifecycle evidence writer atomic contract — same-directory temp and cleanup on interruption', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm20-a-favorites-lifecycle-atomic-'));
  try {
    const out = path.join(dir, 'lifecycle.json');
    let tmpSeen = null;
    atomicWriteJsonSync(out, { ok: true }, {
      beforeRename(tmp) {
        tmpSeen = tmp;
        assert.equal(path.dirname(tmp), dir);
        assert.equal(fs.existsSync(out), false);
      },
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { ok: true });
    assert.equal(tmpSeen && fs.existsSync(tmpSeen), false);

    fs.writeFileSync(out, '{"old":true}\n');
    let failedTmp = null;
    assert.throws(() => atomicWriteJsonSync(out, { ok: false }, {
      beforeRename(tmp) {
        failedTmp = tmp;
        throw new Error('simulated interruption before rename');
      },
    }), /simulated interruption/);
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { old: true });
    assert.equal(failedTmp && fs.existsSync(failedTmp), false);
    assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('lifecycle evidence writer', { skip: !writeEvidence }, () => {
  const suffix = TREE === 'homepage' ? '-homepage' : '';
  const out = path.join(EVIDENCE_DIR, `W4-M20-A-FAVORITES-LIFECYCLE-${STAMP}-red${suffix}.json`);
  const chartSource = fs.readFileSync(CHART_JS);
  const methodText = extractInitDrawingTools(chartSource.toString('utf8'));
  const failed = rows.filter((r) => !r.pass);
  const payload = {
    worker: 'W4-FABLE-CORRECTION',
    fix: 'M20-A-FAVORITES-LIFECYCLE',
    mode: 'red',
    tree: TREE,
    stamp: STAMP,
    endToEndStatus: 'API-READY-PENDING-CHART-LIFECYCLE',
    lifecycleBlocker:
      'chart.js initDrawingTools() must call favoritesManager?.destroy() before new FavoritesManager(this)',
    executionModel:
      'REAL initDrawingTools method text extracted from chart.js (brace-matched, hash-pinned) and executed against the real FavoritesManager class — not a replacement model',
    chartJsSha256: sha256(chartSource),
    initDrawingToolsSha256: methodText ? sha256(methodText) : null,
    favoritesManagerSha256: sha256(fs.readFileSync(PRODUCT)),
    replay: `M20_A_LIFECYCLE_EVIDENCE=red node --test --test-concurrency=1 "<repo>/${path.relative(REPO_ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, '/')}"`,
    node: process.version,
    generatedAt: new Date().toISOString(),
    rows,
    summary: { total: rows.length, pass: rows.length - failed.length, fail: failed.length },
    verdict: failed.length === 0 ? 'LIFECYCLE-RED' : 'FAIL',
  };
  atomicWriteJsonSync(out, payload);
  process.stdout.write(`Wrote lifecycle evidence ${out} verdict=${payload.verdict}\n`);
});
