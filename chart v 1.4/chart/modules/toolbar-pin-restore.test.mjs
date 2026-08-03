/**
 * TAL-01865 — "pinned items and timeframes" must survive a refresh.
 *
 * Audit found the split: pinned indicators (indPinned) and goto items already
 * persist, but pinned timeframes (tfPinned) and pinned drawing tools
 * (toolPinned) were plain useState with hardcoded defaults and no storage at
 * all, so every refresh reset the toolbar to factory pins.
 *
 * The subtle half is that these two have *non-empty* defaults, so "nothing
 * stored yet" and "user unpinned everything" are different states. A loader
 * that collapses both to the defaults resurrects pins the user deliberately
 * removed, which is its own bug — there is a cell for that below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: RUNTIME_MODULE — the real module is imported and called in-process. Green is evidence about the module, NOT about served bytes: nothing here boots the built product.');

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

const ROOT = findRoot(__dirname);
const JSX = path.resolve(findRoot(__dirname), 'chart v 1.4/talaria-design/src/TalariaV8bLive.jsx');

// The module guards on `typeof window`, so the fake store must exist at import.
const store = new Map();
globalThis.window = {
  userStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  },
};
globalThis.localStorage = globalThis.window.userStorage;

const mod = await import('../../talaria-design/src/toolbarPinStorage.js');
const {
  loadTfPinned, saveTfPinned, loadToolPinned, saveToolPinned,
  DEFAULT_TF_PINNED, DEFAULT_TOOL_PINNED, TF_PINNED_MAX, TOOL_PINNED_MAX,
  TF_PINNED_STORAGE_KEY,
} = mod;

const jsxSrc = fs.readFileSync(JSX, 'utf8');
const reset = () => store.clear();

test('TOOLBARPIN: absent storage falls back to the factory defaults', () => {
  reset();
  assert.deepEqual(loadTfPinned(), DEFAULT_TF_PINNED);
  assert.deepEqual(loadToolPinned(), DEFAULT_TOOL_PINNED);
});

test('TOOLBARPIN: anti-vacuity — the stored value differs from the default', () => {
  reset();
  const custom = ['30m', '2H'];
  assert.notDeepEqual(custom, DEFAULT_TF_PINNED, 'fixture matches the default; a pass would prove nothing');
  saveTfPinned(custom);
  assert.deepEqual(loadTfPinned(), custom);
});

test('TOOLBARPIN: green — a refresh keeps the user\'s timeframe pins', () => {
  reset();
  let pinned = loadTfPinned();               // first mount
  pinned = pinned.filter((t) => t !== '1m'); // user unpins 1m
  pinned = [...pinned, '2H'];                // ...and pins 2H
  saveTfPinned(pinned);
  assert.deepEqual(loadTfPinned(), pinned, 'remount did not restore the user\'s pins');
});

test('TOOLBARPIN: green — a refresh keeps the user\'s tool pins', () => {
  reset();
  const pinned = [...loadToolPinned(), 'Ray'];
  saveToolPinned(pinned);
  assert.deepEqual(loadToolPinned(), pinned);
});

test('TOOLBARPIN: unpinning everything survives — defaults are not resurrected', () => {
  reset();
  saveTfPinned([]);
  assert.deepEqual(loadTfPinned(), [], 'an emptied toolbar came back with factory pins');
  saveToolPinned([]);
  assert.deepEqual(loadToolPinned(), []);
});

test('TOOLBARPIN: mutant — the pre-fix line loses the pins on remount', () => {
  reset();
  // Literal pre-fix behaviour: hardcoded initial state, no save effect.
  const preFixInitial = () => ['1m', '5m', '15m', '1H', '4H', '1D'];
  let pinned = preFixInitial();
  pinned = [...pinned.filter((t) => t !== '1m'), '2H']; // user edits the toolbar
  const afterRefresh = preFixInitial();                 // remount
  assert.notDeepEqual(afterRefresh, pinned, 'mutant kept the edit; the gate is not discriminating');
  assert.deepEqual(afterRefresh, DEFAULT_TF_PINNED, 'mutant should reset to factory pins');
});

test('TOOLBARPIN: corrupt storage degrades to defaults instead of throwing', () => {
  reset();
  store.set(TF_PINNED_STORAGE_KEY, '{not json');
  assert.deepEqual(loadTfPinned(), DEFAULT_TF_PINNED);
  store.set(TF_PINNED_STORAGE_KEY, '{"pinned":"not-an-array"}');
  assert.deepEqual(loadTfPinned(), DEFAULT_TF_PINNED);
});

test('TOOLBARPIN: load and save both honour the UI pin caps', () => {
  reset();
  const many = Array.from({ length: 40 }, (_, i) => `tf-${i}`);
  saveTfPinned(many);
  assert.equal(loadTfPinned().length, TF_PINNED_MAX);
  saveToolPinned(many);
  assert.equal(loadToolPinned().length, TOOL_PINNED_MAX);
});

test('TOOLBARPIN: duplicates and blanks are normalised away', () => {
  reset();
  saveTfPinned(['1H', '1H', '  ', null, ' 4H ', '4H']);
  assert.deepEqual(loadTfPinned(), ['1H', '4H']);
});

test('TOOLBARPIN: bound — the component initialises both pins from storage', () => {
  assert.match(
    jsxSrc,
    /const \[tfPinned, setTfPinned\] = useState\(\(\) => loadTfPinned\(\)\)/,
    'tfPinned is not initialised from storage',
  );
  assert.match(
    jsxSrc,
    /const \[toolPinned, setToolPinned\] = useState\(\(\) => loadToolPinned\(\)\)/,
    'toolPinned is not initialised from storage',
  );
  assert.doesNotMatch(
    jsxSrc,
    /useState\(\["1m","5m","15m","1H","4H","1D"\]\)/,
    'the hardcoded timeframe default is still the initial state',
  );
});

test('TOOLBARPIN: bound — both pins are written back on change', () => {
  assert.match(
    jsxSrc,
    /saveTfPinned\(tfPinned\);\s*\}, \[tfPinned\]\)/,
    'no effect persists tfPinned',
  );
  assert.match(
    jsxSrc,
    /saveToolPinned\(toolPinned\);\s*\}, \[toolPinned\]\)/,
    'no effect persists toolPinned',
  );
});

test('TOOLBARPIN: bound — the storage module is actually imported', () => {
  assert.match(
    jsxSrc,
    /import \{[^}]*loadTfPinned[^}]*\} from "\.\/toolbarPinStorage\.js"/,
    'toolbarPinStorage is not imported',
  );
});
