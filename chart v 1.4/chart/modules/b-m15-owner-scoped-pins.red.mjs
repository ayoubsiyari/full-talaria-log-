/**
 * B-W15 / Manager B — owner-scoped preference contract.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/b-m15-owner-scoped-pins.red.mjs"
 *
 * Mutation binding: 9 designed / 0 survived is the only green verdict.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  B_W15_MANDATORY_MUTANTS,
  B_W15_MUTATION_TARGET,
} from './b-fixtures/b-w15-owner-scoped-pins-mutants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_PATH = path.join(__dirname, 'preferences-sync.js');
const PRODUCT_SRC = fs.readFileSync(PRODUCT_PATH, 'utf8');
const OWNER_BLOCK_MARKER = '/* -----------------------------------------------------------------------------\n * Owner-scoped pin preferences';

const KEY_TIMEFRAMES = 'pref.v1.pins.timeframes';
const KEY_TOOLS = 'pref.v1.pins.tools';
const KEY_OPEN = 'pref.v1.pinbar.open';
const KEY_POS = 'pref.v1.pinbar.pos';
const KEY_SCHEMA = 'pref.v1.meta.schemaVersion';

function prefStorageKey(owner, tier, scopeId, key) {
  return `pref.v1.owner.${encodeURIComponent(owner)}.${tier}.${encodeURIComponent(scopeId)}.${key}`;
}

function makeStorage({ throwOnSet = false } = {}) {
  const map = new Map();
  const writes = [];
  const removes = [];
  return {
    map,
    writes,
    removes,
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] || null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (throwOnSet) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      writes.push([String(k), String(v)]);
      map.set(String(k), String(v));
    },
    removeItem(k) {
      removes.push(String(k));
      map.delete(String(k));
    },
  };
}

function loadPreferences(source = PRODUCT_SRC, options = {}) {
  const storage = options.storageUnavailable ? null : (options.storage || makeStorage(options));
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    fetch() { throw new Error('network disabled in B-W15 harness'); },
    CustomEvent: class CustomEvent {
      constructor(name, init) {
        this.type = name;
        this.detail = init && init.detail;
      }
    },
    URLSearchParams,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval(fn) {
      sandbox.__intervals.push(fn);
      return sandbox.__intervals.length;
    },
    clearInterval() {},
    __intervals: [],
  };
  sandbox.window = {
    localStorage: storage,
    userStorage: storage,
    __talariaUserId: options.userId,
    __talariaWorkspaceId: options.workspaceId,
    __talariaSessionId: options.sessionId,
    __TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1: options.kill ? true : undefined,
    location: { search: options.search || '' },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  };
  sandbox.localStorage = storage;
  sandbox.userStorage = storage;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'preferences-sync.vm.js' });
  return { api: sandbox.window.TalariaPreferences, sandbox, storage };
}

function ownerKeys(storage, owner) {
  return Array.from(storage.map.keys()).filter((k) => k.includes(`owner.${encodeURIComponent(owner)}.`));
}

function ownerValues(storage, owner) {
  return ownerKeys(storage, owner).map((k) => [k, storage.map.get(k)]);
}

function replaceOrThrow(src, needle, replacement, label) {
  assert.ok(src.includes(needle), `mutant anchor missing: ${label}`);
  return src.replace(needle, replacement);
}

function replaceRegexOrThrow(src, regex, replacement, label) {
  assert.ok(regex.test(src), `mutant anchor missing: ${label}`);
  return src.replace(regex, replacement);
}

function stubSource(src) {
  const start = src.indexOf(OWNER_BLOCK_MARKER);
  assert.ok(start > 0, 'owner block marker must exist');
  return `${src.slice(0, start)}
(function () {
    window.TalariaPreferences = {
        SCHEMA_VERSION: 1,
        TIERS: { user: 'user', workspace: 'workspace', session: 'session' },
        PRECEDENCE: ['session', 'workspace', 'user'],
        KEYS: { timeframes: '${KEY_TIMEFRAMES}', tools: '${KEY_TOOLS}', barOpen: '${KEY_OPEN}', barPos: '${KEY_POS}', schemaVersion: '${KEY_SCHEMA}' },
        isEnabled: function () { return true; },
        isOwnerReady: function () { return true; },
        pendingPinKeys: function () { return []; },
        getPins: function () { return { timeframes: [], tools: [], barOpen: false, barPos: null }; },
        getPin: function () { return null; },
        setPin: function () { return true; },
        getItem: function () { return null; },
        setItem: function () { return true; },
        reset: function () { return true; },
        reconcileCloud: function () { return { applied: 0, skipped: 0 }; },
        cloudQueue: function () { return []; },
        clearCloudQueue: function () {},
        init: function () { return true; }
    };
})();`;
}

const MUTANTS = {
  'stub-none': stubSource,
  'owner-ignored-global-key': (src) => replaceOrThrow(
    src,
    'return PREFIX + ownerToken(owner) + \'.\' + tier + \'.\' + scopeToken(scopeId) + \'.\' + key;',
    'return PREFIX + ownerToken(\'global\') + \'.\' + tier + \'.\' + scopeToken(scopeId) + \'.\' + key;',
    'owner ignored',
  ),
  'queued-write-flushed-to-current-owner': (src) => replaceOrThrow(
    src,
    'if (op.ownerId === null || op.ownerId !== resolvedOwnerId) {\n                continue;\n            }',
    'if (op.ownerId === null) op.ownerId = resolvedOwnerId;\n            if (op.ownerId !== resolvedOwnerId) {\n                continue;\n            }',
    'queued write wrong owner',
  ),
  'tier-precedence-inverted': (src) => replaceOrThrow(
    src,
    'var READ_PRECEDENCE = [TIER_SESSION, TIER_WORKSPACE, TIER_USER];',
    'var READ_PRECEDENCE = [TIER_USER, TIER_WORKSPACE, TIER_SESSION];',
    'tier precedence inverted',
  ),
  'whole-blob-clobbers-per-key': (src) => replaceOrThrow(
    src,
    'return PREFIX + ownerToken(owner) + \'.\' + tier + \'.\' + scopeToken(scopeId) + \'.\' + key;',
    'return PREFIX + ownerToken(owner) + \'.\' + tier + \'.\' + scopeToken(scopeId) + \'.pref.v1.pins.aggregate\';',
    'whole blob key',
  ),
  'unknown-keys-dropped-on-migration': (src) => replaceRegexOrThrow(
    src,
    /if \(stored && typeof stored === 'object' && !Array\.isArray\(stored\)\) \{\n\s+for \(k in stored\) \{\n\s+if \(Object\.prototype\.hasOwnProperty\.call\(stored, k\)\) merged\[k\] = stored\[k\];\n\s+}\n\s+}/,
    'if (stored && false) {}',
    'unknown key preservation',
  ),
  'schema-stamped-on-read': (src) => replaceOrThrow(
    src,
    'if (isDisabled()) return pins;\n        var tf = decodeKeyValue',
    'if (isDisabled()) return pins;\n        var __owner = ownerId(options); if (__owner !== null) ensureSchemaVersion(__owner, TIER_USER, "user");\n        var tf = decodeKeyValue',
    'schema on read',
  ),
  'kill-switch-still-writes': (src) => replaceRegexOrThrow(
    src,
    /function isDisabled\(\) \{\n\s+return window\.__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1 === true\n\s+\|\| window\.__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1 === '1';\n\s+}/,
    'function isDisabled() {\n        return false;\n    }',
    'kill switch ignored',
  ),
  'ids-only-validation-bypassed': (src) => replaceOrThrow(
    src,
    'if (typeof id !== \'string\') continue;\n            id = id.trim();',
    'if (false) continue;\n            id = id.trim();',
    'ids only validation bypassed',
  ),
};

function runCell(cell, source = PRODUCT_SRC) {
  cell.fn(source);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const CELLS = [
  {
    name: 'empty storage reads defaults and writes nothing',
    productChange: 'Any read-time default materialization or schema stamp would write storage here.',
    fn(source) {
      const { api, storage } = loadPreferences(source, { userId: 'acct-a', workspaceId: 'ws-a', sessionId: 'sess-a' });
      assert.deepEqual(plain(api.getPins()), { timeframes: [], tools: [], barOpen: false, barPos: null });
      assert.equal(storage.writes.length, 0);
    },
  },
  {
    name: 'storage present with empty object fails open',
    productChange: 'Treating malformed list/object storage as valid pin state would return junk or mutate storage.',
    fn(source) {
      const storage = makeStorage();
      storage.map.set(prefStorageKey('acct-a', 'user', 'user', KEY_TIMEFRAMES), '{}');
      const { api } = loadPreferences(source, { storage, userId: 'acct-a' });
      assert.deepEqual(plain(api.getPins().timeframes), []);
      assert.equal(storage.writes.length, 0);
    },
  },
  {
    name: 'explicit null undefined empty owner ids rejected',
    productChange: 'A Number/truthiness id guard accepting null, undefined, or empty string would persist an ownerless key.',
    fn(source) {
      for (const ownerId of [null, undefined, '']) {
        const { api, storage } = loadPreferences(source, { userId: 'fallback-owner' });
        assert.equal(api.setPin('timeframes', ['1m'], { ownerId }), false);
        assert.equal(storage.writes.length, 0);
      }
    },
  },
  {
    name: 'owner keys isolate two accounts',
    productChange: 'Dropping owner from the storage key would let account B read account A pins.',
    fn(source) {
      const storage = makeStorage();
      let env = loadPreferences(source, { storage, userId: 'acct-a' });
      assert.equal(env.api.setPin('timeframes', ['1m']), true);
      env = loadPreferences(source, { storage, userId: 'acct-b' });
      assert.deepEqual(plain(env.api.getPins().timeframes), []);
      assert.equal(env.api.setPin('timeframes', ['5m']), true);
      env = loadPreferences(source, { storage, userId: 'acct-a' });
      assert.deepEqual(plain(env.api.getPins().timeframes), ['1m']);
      assert.notDeepEqual(ownerValues(storage, 'acct-a'), ownerValues(storage, 'acct-b'));
    },
  },
  {
    name: 'queued unresolved owner write is not flushed to later owner',
    productChange: 'Flushing ownerless pending writes to whichever account resolves first would leak pins across accounts.',
    fn(source) {
      const storage = makeStorage();
      const env = loadPreferences(source, { storage, userId: null });
      assert.equal(env.api.setPin('tools', ['fib']), true);
      assert.equal(storage.writes.length, 0);
      env.sandbox.window.__talariaUserId = 'acct-b';
      env.api.init();
      assert.deepEqual(plain(env.api.getPins().tools), []);
      assert.equal(ownerKeys(storage, 'acct-b').some((k) => k.includes(KEY_TOOLS)), false);
    },
  },
  {
    name: 'tier precedence is session then workspace then user',
    productChange: 'Inverting tier precedence would make broader preferences hide a session override.',
    fn(source) {
      const storage = makeStorage();
      const env = loadPreferences(source, { storage, userId: 'acct-a', workspaceId: 'ws-a', sessionId: 'sess-a' });
      assert.equal(env.api.setPin('timeframes', ['1m'], { tier: 'user' }), true);
      assert.equal(env.api.setPin('timeframes', ['5m'], { tier: 'workspace' }), true);
      assert.equal(env.api.setPin('timeframes', ['15m'], { tier: 'session' }), true);
      assert.deepEqual(plain(env.api.getPins().timeframes), ['15m']);
      assert.equal(env.api.reset({ tier: 'session' }), true);
      assert.deepEqual(plain(env.api.getPins().timeframes), ['5m']);
      assert.equal(env.api.reset({ tier: 'workspace' }), true);
      assert.deepEqual(plain(env.api.getPins().timeframes), ['1m']);
    },
  },
  {
    name: 'per-key writes do not clobber concurrent key writes',
    productChange: 'Writing one aggregate blob would let a tools write erase an existing timeframes write.',
    fn(source) {
      const { api } = loadPreferences(source, { userId: 'acct-a' });
      assert.equal(api.setPin('timeframes', ['1m']), true);
      assert.equal(api.setPin('tools', ['trendline']), true);
      assert.deepEqual(plain(api.getPins().timeframes), ['1m']);
      assert.deepEqual(plain(api.getPins().tools), ['trendline']);
    },
  },
  {
    name: 'pin lists accept only valid string ids',
    productChange: 'Accepting non-string, blank, oversized, or duplicate pin ids would persist invalid UI ids and leak coerced values through getPins.',
    fn(source) {
      const { api } = loadPreferences(source, { userId: 'acct-a' });
      const longId = 'x'.repeat(81);
      assert.equal(api.setPin('timeframes', [
        '1m',
        { id: 'object' },
        42,
        true,
        null,
        ['nested'],
        '',
        '   ',
        longId,
        '5m',
        ' 5m ',
        '1m',
      ]), true);
      assert.deepEqual(plain(api.getPins().timeframes), ['1m', '5m']);
    },
  },
  {
    name: 'unknown position keys survive lazy migration',
    productChange: 'A migration that rewrites only known position fields would drop newer-client metadata.',
    fn(source) {
      const storage = makeStorage();
      storage.map.set(prefStorageKey('acct-a', 'user', 'user', KEY_POS), JSON.stringify({ x: 1, futureAnchor: 'keep-me' }));
      const { api } = loadPreferences(source, { storage, userId: 'acct-a' });
      assert.equal(api.setPin('barPos', { y: 2 }), true);
      assert.deepEqual(plain(api.getPins().barPos), { x: 1, futureAnchor: 'keep-me', y: 2 });
    },
  },
  {
    name: 'schema version is lazy and never stamped on read or init',
    productChange: 'Calling ensureSchemaVersion from init/getPins would mutate every logged-in user on page load.',
    fn(source) {
      const { api, storage } = loadPreferences(source, { userId: 'acct-a' });
      api.init();
      api.getPins();
      assert.equal(Array.from(storage.map.keys()).some((k) => k.includes(KEY_SCHEMA)), false);
      assert.equal(api.setPin('tools', ['brush']), true);
      assert.equal(Array.from(storage.map.keys()).some((k) => k.includes(KEY_SCHEMA)), true);
    },
  },
  {
    name: 'kill switch makes module fully inert',
    productChange: 'Ignoring the reserved kill switch would still expose writes or schema stamping in disabled deployments.',
    fn(source) {
      const { api, storage, sandbox } = loadPreferences(source, { userId: 'acct-a', kill: true });
      assert.equal(api.isEnabled(), false);
      assert.equal(api.setPin('tools', ['brush']), false);
      assert.deepEqual(plain(api.getPins()), { timeframes: [], tools: [], barOpen: false, barPos: null });
      assert.equal(storage.writes.length, 0);
      assert.equal(sandbox.window.__TALARIA_PREF_SCHEMA_VERSION, undefined);
    },
  },
  {
    name: 'storage quota failure fails safe',
    productChange: 'Letting write exceptions escape or leaving partial data would break fail-safe writes.',
    fn(source) {
      const { api, storage } = loadPreferences(source, { userId: 'acct-a', throwOnSet: true });
      assert.equal(api.setPin('tools', ['brush']), false);
      assert.equal(storage.map.size, 0);
      assert.deepEqual(plain(api.getPins().tools), []);
    },
  },
  {
    name: 'storage unavailable fails open on read and safe on write',
    productChange: 'Assuming localStorage exists would throw during private-mode or embedded storage failures.',
    fn(source) {
      const { api } = loadPreferences(source, { userId: 'acct-a', storageUnavailable: true });
      assert.deepEqual(plain(api.getPins()), { timeframes: [], tools: [], barOpen: false, barPos: null });
      assert.equal(api.setPin('tools', ['brush']), false);
    },
  },
  {
    name: 'cloud reconciliation is owner scoped and per key',
    productChange: 'Reconciling a cloud blob without owner/tier/key checks would clobber local unrelated keys or cross accounts.',
    fn(source) {
      const { api } = loadPreferences(source, { userId: 'acct-a' });
      assert.equal(api.setPin('timeframes', ['1m']), true);
      const result = api.reconcileCloud([
        { ownerId: 'acct-a', tier: 'user', scopeId: 'user', key: KEY_TOOLS, value: ['brush'], schemaVersion: 1, updatedAt: '999' },
        { ownerId: '', tier: 'user', scopeId: 'user', key: KEY_TIMEFRAMES, value: ['bad'], schemaVersion: 1, updatedAt: '999' },
      ]);
      assert.deepEqual(plain(result), { applied: 1, skipped: 1 });
      assert.deepEqual(plain(api.getPins().timeframes), ['1m']);
      assert.deepEqual(plain(api.getPins().tools), ['brush']);
    },
  },
];

test('B-W15 contract cells declare non-decorative failure reasons', () => {
  for (const cell of CELLS) {
    assert.ok(cell.productChange && cell.productChange.length > 20, `${cell.name} has product-change failure reason`);
    process.stdout.write(`CELL ${cell.name} — ${cell.productChange}\n`);
  }
});

for (const cell of CELLS) {
  test(`B-W15 contract: ${cell.name}`, () => {
    runCell(cell);
  });
}

test('B-W15 mutation binding: 9 designed / 0 survived; stub dies', () => {
  assert.deepEqual(B_W15_MANDATORY_MUTANTS, Object.keys(MUTANTS));
  assert.equal(B_W15_MUTATION_TARGET.designed, B_W15_MANDATORY_MUTANTS.length);

  const survived = [];
  const died = [];
  for (const name of B_W15_MANDATORY_MUTANTS) {
    const mutantSource = MUTANTS[name](PRODUCT_SRC);
    let allPassed = true;
    for (const cell of CELLS) {
      try {
        runCell(cell, mutantSource);
      } catch (err) {
        allPassed = false;
        died.push({ mutant: name, cell: cell.name, reason: err && err.message });
        break;
      }
    }
    if (allPassed) survived.push(name);
  }

  const stubDies = died.some((row) => row.mutant === 'stub-none');
  process.stdout.write(`MUTATION B-W15: ${B_W15_MUTATION_TARGET.designed} designed / ${survived.length} survived; stub dies=${stubDies}\n`);
  if (survived.length) process.stdout.write(`SURVIVORS ${survived.join(', ')}\n`);
  assert.equal(stubDies, B_W15_MUTATION_TARGET.requiredStubMustDie);
  assert.deepEqual(survived, []);
});
