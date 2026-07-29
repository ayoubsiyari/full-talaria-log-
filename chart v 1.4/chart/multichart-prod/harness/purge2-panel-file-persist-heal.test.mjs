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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRID_SRC = path.resolve(__dirname, '..', '..', '..', 'talaria-design', 'src', 'MultichartGrid.jsx');
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
});
