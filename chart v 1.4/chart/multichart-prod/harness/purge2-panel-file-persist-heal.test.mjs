/**
 * PURGE-2 / FLAG-03 — persisted panel fileIds must not poison boots after
 * a destructive kill-switch session. Helpers in MultichartGrid.jsx.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/multichart-prod/harness/purge2-panel-file-persist-heal.test.mjs"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/**
 * Walk up to the repo root rather than counting directory levels.
 *
 * The '..', '..', '..' this replaced reached `chart v 1.4/talaria-design/` from
 * the canonical harness and `homepage/public/talaria-design/` from the mirror —
 * a directory that does not exist, because talaria-design has no counterpart
 * under homepage/. The mirrored copy died at import and had never run, and a
 * gate that dies at import reads in a sweep exactly like one that passed.
 *
 * There is one subject, so both copies name it explicitly instead of computing a
 * different one from their own depth.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRID_SRC = path.resolve(findRoot(__dirname), 'chart v 1.4/talaria-design/src/MultichartGrid.jsx');
if (!fs.existsSync(GRID_SRC)) throw new Error(`SUBJECT_ABSENT: ${GRID_SRC}`);
const SOURCE = fs.readFileSync(GRID_SRC, 'utf8');

function matchingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unterminated block');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = source.indexOf('{', start);
  return source.slice(start, matchingBrace(source, open) + 1);
}

function installHelpers() {
  const store = new Map();
  const sandbox = {
    window: {},
    HOST_PANEL_ID: 'A',
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    store,
  };
  vm.createContext(sandbox);
  vm.runInContext(`
    ${extractFunction(SOURCE, 'mcPanelFilePersistV1Enabled')}
    ${extractFunction(SOURCE, 'mcPanelFilePersistStorageKey')}
    ${extractFunction(SOURCE, 'readPersistedPanelFileMap')}
    ${extractFunction(SOURCE, 'persistPanelFileId')}
    ${extractFunction(SOURCE, 'clearPersistedPanelFileId')}
    ${extractFunction(SOURCE, 'sanitizePersistedPanelFileMap')}
    ${extractFunction(SOURCE, 'resolveBootFileIdForPanel')}
  `, sandbox);
  return sandbox;
}

test('persist helpers exist and boot self-heal is wired', () => {
  assert.ok(SOURCE.includes('function clearPersistedPanelFileId('));
  assert.ok(SOURCE.includes('function sanitizePersistedPanelFileMap('));
  assert.ok(SOURCE.includes('boot self-heal'));
  assert.ok(SOURCE.includes('clearPersistedPanelFileId(existingId)'));
  assert.ok(SOURCE.includes('onChartBootFailed'));
});

test('clearPersistedPanelFileId drops a poisoned tile and resolve falls back to host', () => {
  const s = installHelpers();
  vm.runInContext(`persistPanelFileId('B', 'EURUSD_BAD'); persistPanelFileId('C', 'GBPUSD_BAD');`, s);
  assert.equal(vm.runInContext(`resolveBootFileIdForPanel('B', 'HOSTPAIR')`, s), 'EURUSD_BAD');
  vm.runInContext(`clearPersistedPanelFileId('B')`, s);
  assert.equal(vm.runInContext(`resolveBootFileIdForPanel('B', 'HOSTPAIR')`, s), 'HOSTPAIR');
  assert.equal(vm.runInContext(`resolveBootFileIdForPanel('C', 'HOSTPAIR')`, s), 'GBPUSD_BAD');
});

test('sanitizePersistedPanelFileMap drops recycled/orphan ids not in the live layout', () => {
  const s = installHelpers();
  vm.runInContext(`
    persistPanelFileId('B', 'PAIR_B');
    persistPanelFileId('C', 'PAIR_C');
    persistPanelFileId('D', 'PAIR_D');
    sanitizePersistedPanelFileMap(new Set(['B']));
  `, s);
  assert.equal(vm.runInContext(`resolveBootFileIdForPanel('B', 'HOST')`, s), 'PAIR_B');
  assert.equal(vm.runInContext(`resolveBootFileIdForPanel('C', 'HOST')`, s), 'HOST');
  assert.equal(vm.runInContext(`resolveBootFileIdForPanel('D', 'HOST')`, s), 'HOST');
});

test('layout-removal path clears persisted fileId (source contract)', () => {
  const removal = SOURCE.indexOf('for (const existingId of Array.from(mgr.charts.keys()))');
  assert.notEqual(removal, -1);
  const window = SOURCE.slice(removal, removal + 1200);
  assert.ok(window.includes('clearPersistedPanelFileId(existingId)'));
  assert.ok(window.includes('orderSyncedPanelsRef.current.delete(existingId)'));
  assert.ok(window.includes('clonedPanelsRef.current.delete(existingId)'));
  assert.ok(window.includes('retiredPanelIdsRef.current.add(existingId)'));
});

test('recycled-id heal belongs on re-add/addChart path (PO single→4 vs recycle)', () => {
  assert.ok(SOURCE.includes('retiredPanelIdsRef'));
  assert.ok(SOURCE.includes('recycled-panel heal'));
  assert.ok(SOURCE.includes('retiredPanelIdsRef.current.has(tile.id)'));
  // Must force host fileId for retired ids — not trust resolveBootFileIdForPanel alone.
  const spawn = SOURCE.indexOf('retiredPanelIdsRef.current.has(tile.id)');
  assert.notEqual(spawn, -1);
  const window = SOURCE.slice(spawn, spawn + 900);
  assert.ok(window.includes('bootFileId = effFile'));
  assert.ok(window.includes('clearPersistedPanelFileId(tile.id)'));
});
