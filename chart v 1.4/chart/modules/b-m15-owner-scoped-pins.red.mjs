import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const PRODUCT_MODULES = [
  ['chart v 1.4', 'chart', 'modules', 'preferences-sync.js'],
  ['chart v 1.4', 'chart', 'modules', 'preferences-init.js'],
];

function findRepoRoot(startDir) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    const hasRootPackage = fs.existsSync(path.join(dir, 'package.json'));
    const hasChartPrefs = fs.existsSync(path.join(dir, ...PRODUCT_MODULES[0]));
    if (hasRootPackage && hasChartPrefs) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Could not resolve repository root from ${startDir}`);
}

const repoRoot = findRepoRoot(__dirname);
const CHILD_RESULT_PREFIX = 'B_M15_CHILD_RESULT ';
const CHILD_TIMEOUT_MS = 10_000;
const fixturePath = path.join(
  repoRoot,
  'chart v 1.4',
  'chart',
  'modules',
  'b-fixtures',
  'm15-pin-lifecycle-matrix.json'
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

class FakeLocalStorage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
    this.throwOnGet = new Set();
    this.emptyOnGet = new Set();
    this.setCounts = new Map();
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key) {
    if (this.throwOnGet.has(key)) throw new Error(`forced getItem failure for ${key}`);
    if (this.emptyOnGet.has(key)) return null;
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
    this.setCounts.set(String(key), (this.setCounts.get(String(key)) ?? 0) + 1);
  }

  removeItem(key) {
    this.map.delete(String(key));
  }

  snapshot() {
    return Object.fromEntries(this.map.entries());
  }
}

function scopedKey(ownerId, key) {
  return `u${ownerId}_${key}`;
}

function installBrowser({ storage, cachedOwner = null, resolvedOwner = null, search = '', killSwitch = false } = {}) {
  const localStorage = storage ?? new FakeLocalStorage();
  if (cachedOwner) localStorage.setItem('_uid', cachedOwner);
  let uid = null;
  try {
    uid = localStorage.getItem('_uid');
  } catch {
    uid = null;
  }

  const listeners = new Map();
  const window = {
    location: { search, pathname: '/chart/live' },
    localStorage,
    console,
    __TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1: killSwitch,
    addEventListener(type, cb) {
      const list = listeners.get(type) ?? [];
      list.push(cb);
      listeners.set(type, list);
    },
    removeEventListener(type, cb) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((entry) => entry !== cb));
    },
    dispatchEvent(event) {
      for (const cb of listeners.get(event.type) ?? []) cb.call(window, event);
      return true;
    },
  };
  if (resolvedOwner) window.__talariaUserId = resolvedOwner;

  window.userKey = function userKey(key) {
    let id = uid || window.__talariaUserId;
    if (!id) {
      try {
        id = localStorage.getItem('_uid');
      } catch {
        id = null;
      }
    }
    if (id) {
      uid = id;
      return scopedKey(id, key);
    }
    return key;
  };

  window.userStorage = {
    getItem(key) {
      const scoped = localStorage.getItem(window.userKey(key));
      if (scoped !== null) return scoped;
      const legacy = localStorage.getItem(key);
      if (legacy !== null && uid) {
        localStorage.setItem(window.userKey(key), legacy);
        localStorage.removeItem(key);
      }
      return legacy;
    },
    setItem(key, val) {
      localStorage.setItem(window.userKey(key), val);
    },
    removeItem(key) {
      localStorage.removeItem(window.userKey(key));
    },
  };

  globalThis.window = window;
  globalThis.localStorage = localStorage;
  globalThis.userStorage = window.userStorage;
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  };
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ success: false }) });
  return { window, localStorage, resolveOwner: (owner) => {
    window.__talariaUserId = owner;
    localStorage.setItem('_uid', owner);
  } };
}

const facadeContexts = new WeakMap();
let lastLoadContext = null;
let currentCellLoadErrors = null;

function moduleLabel(modulePath) {
  return modulePath.join('/');
}

function clearProductRequireCache(absolute) {
  const resolved = require.resolve(absolute);
  delete require.cache[resolved];
  return resolved;
}

async function loadProductFacade(context) {
  const originalConsole = globalThis.console;
  globalThis.console = {
    log() {},
    info() {},
    warn() {},
    error() {},
  };
  try {
    for (const modulePath of PRODUCT_MODULES) {
      const absolute = path.join(repoRoot, ...modulePath);
      const label = moduleLabel(modulePath);
      context.loadAttempts.push(label);
      clearProductRequireCache(absolute);
      require(absolute);
      context.executedModules.push(label);
    }
  } catch (error) {
    context.loadErrors.push(error && error.stack ? error.stack : String(error));
  } finally {
    globalThis.console = originalConsole;
  }
  const facade = globalThis.window?.TalariaPreferences ?? null;
  lastLoadContext = context;
  if (facade && typeof facade === 'object') facadeContexts.set(facade, context);
  return facade;
}

function requireFacade(facade) {
  assert.ok(facade, describeAbsentFacade(facade));
  assert.equal(typeof facade.getItem, 'function', 'window.TalariaPreferences.getItem must exist');
  assert.equal(typeof facade.setItem, 'function', 'window.TalariaPreferences.setItem must exist');
}

function contextForFacade(facade) {
  if (facade && typeof facade === 'object') return facadeContexts.get(facade) ?? lastLoadContext;
  return lastLoadContext;
}

function summarizeLoadErrors(loadErrors) {
  return loadErrors.map((entry) => String(entry).split('\n')[0]).join(' | ');
}

function describeAbsentFacade(facade) {
  const context = contextForFacade(facade);
  if (!context) return 'window.TalariaPreferences is absent: product load was not attempted';
  if (context.loadErrors.length > 0) {
    return `window.TalariaPreferences is absent: product module threw during execution; loadErrors=${summarizeLoadErrors(context.loadErrors)}`;
  }
  if (context.executedModules.length === 0) {
    return 'window.TalariaPreferences is absent: product modules never executed and no load error was raised';
  }
  return `window.TalariaPreferences is absent: product modules executed but published no facade; executed=${context.executedModules.join(', ')}`;
}

function encode(value) {
  return JSON.stringify(value);
}

function decode(raw, fallback) {
  if (raw == null || raw === '') return structuredClone(fallback);
  return JSON.parse(raw);
}

function assertDeepEqual(actual, expected, message) {
  assert.deepEqual(actual, expected, `${message}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
}

function allPinKeys() {
  const keys = fixture.storageKeys;
  return [keys.timeframes, keys.tools, keys.pinbarOpen, keys.pinbarPos];
}

async function mount({ storage, owner = fixture.owners.primary, cachedOwner = owner, resolvedOwner = owner, search = '', killSwitch = false } = {}) {
  const browser = installBrowser({ storage, cachedOwner, resolvedOwner, search, killSwitch });
  const context = { loadAttempts: [], executedModules: [], loadErrors: [] };
  const facade = await loadProductFacade(context);
  if (currentCellLoadErrors && context.loadErrors.length > 0) {
    currentCellLoadErrors.push(...context.loadErrors);
  }
  return { ...browser, facade, context };
}

async function writePins(facade, pins) {
  requireFacade(facade);
  const keys = fixture.storageKeys;
  facade.setItem(keys.timeframes, encode(pins.timeframes));
  facade.setItem(keys.tools, encode(pins.tools));
  facade.setItem(keys.pinbarOpen, encode(pins.pinbarOpen));
  facade.setItem(keys.pinbarPos, encode(pins.pinbarPos));
}

function readPins(facade) {
  requireFacade(facade);
  const keys = fixture.storageKeys;
  const defaults = fixture.defaults;
  return {
    timeframes: decode(facade.getItem(keys.timeframes), defaults.timeframes),
    tools: decode(facade.getItem(keys.tools), defaults.tools),
    pinbarOpen: decode(facade.getItem(keys.pinbarOpen), defaults.pinbarOpen),
    pinbarPos: decode(facade.getItem(keys.pinbarPos), defaults.pinbarPos),
  };
}

function assertPinsEqual(actual, expected, label) {
  assertDeepEqual(actual.timeframes, expected.timeframes, `${label}: timeframes`);
  assertDeepEqual(actual.tools, expected.tools, `${label}: tools`);
  assertDeepEqual(actual.pinbarOpen, expected.pinbarOpen, `${label}: pinbar open`);
  assertDeepEqual(actual.pinbarPos, expected.pinbarPos, `${label}: pinbar position`);
}

function assertOwnerStorage(storage, owner, key, expected) {
  assertDeepEqual(decode(storage.getItem(scopedKey(owner, key)), null), expected, `${owner} ${key}`);
}

function assertNoUnscopedPins(storage) {
  for (const key of allPinKeys()) {
    assert.equal(storage.getItem(key), null, `unscoped ${key} must not be written`);
  }
}

function assertNoSchemaVersion(storage, owner) {
  assert.equal(storage.getItem(scopedKey(owner, fixture.storageKeys.schemaVersion)), null, 'schema version must not be written');
}

async function sameOwnerRefresh() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  const second = await mount({ storage });
  assertPinsEqual(readPins(second.facade), fixture.ownerOnePins, fixture.cells[0].name);
}

async function sameOwnerExitReenter() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  delete globalThis.window;
  delete globalThis.userStorage;
  const second = await mount({ storage });
  assertPinsEqual(readPins(second.facade), fixture.ownerOnePins, fixture.cells[1].name);
}

async function sameOwnerNewSession() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  const newSession = await mount({ storage, search: '?session=qa-new-session' });
  assertPinsEqual(readPins(newSession.facade), fixture.ownerOnePins, fixture.cells[2].name);
}

async function ownerIsolation() {
  const storage = new FakeLocalStorage();
  const ownerA = await mount({ storage, owner: fixture.owners.primary });
  await writePins(ownerA.facade, fixture.ownerOnePins);
  const ownerB = await mount({ storage, owner: fixture.owners.secondary });
  const bPins = readPins(ownerB.facade);
  assertPinsEqual(bPins, fixture.defaults, `${fixture.cells[3].name}: owner B default view`);
  assert.notDeepEqual(bPins.timeframes, fixture.ownerOnePins.timeframes, 'owner B must not see owner A timeframes');
  assert.notDeepEqual(bPins.tools, fixture.ownerOnePins.tools, 'owner B must not see owner A tools');
  const ownerAReturn = await mount({ storage, owner: fixture.owners.primary });
  assertPinsEqual(readPins(ownerAReturn.facade), fixture.ownerOnePins, `${fixture.cells[3].name}: return to owner A`);
}

async function unresolvedOwnerAtBoot() {
  const storage = new FakeLocalStorage();
  const preloaded = await mount({ storage, owner: fixture.owners.primary });
  await writePins(preloaded.facade, fixture.ownerOnePins);
  storage.removeItem('_uid');
  const unresolved = await mount({ storage, cachedOwner: null, resolvedOwner: null });
  assertPinsEqual(readPins(unresolved.facade), fixture.defaults, `${fixture.cells[4].name}: unresolved owner reads defaults`);
  assertNoUnscopedPins(storage);
  for (const key of allPinKeys()) {
    assert.equal(storage.getItem(key), null, `unresolved read must not persist ${key}`);
  }
  unresolved.resolveOwner(fixture.owners.primary);
  assertPinsEqual(readPins(unresolved.facade), fixture.ownerOnePins, `${fixture.cells[4].name}: resolved owner reads scoped values`);
}

async function failedOrEmptyReadNotAuthoritative() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  const keys = fixture.storageKeys;
  const owner = fixture.owners.primary;
  storage.throwOnGet.add(scopedKey(owner, keys.timeframes));
  storage.emptyOnGet.add(scopedKey(owner, keys.tools));
  const second = await mount({ storage });
  try {
    readPins(second.facade);
  } catch {
    // A read failure may surface to the caller, but it must not rewrite storage.
  }
  storage.throwOnGet.clear();
  storage.emptyOnGet.clear();
  assertOwnerStorage(storage, owner, keys.timeframes, fixture.ownerOnePins.timeframes);
  assertOwnerStorage(storage, owner, keys.tools, fixture.ownerOnePins.tools);
  assertOwnerStorage(storage, owner, keys.pinbarOpen, fixture.ownerOnePins.pinbarOpen);
  assertOwnerStorage(storage, owner, keys.pinbarPos, fixture.ownerOnePins.pinbarPos);
}

async function unknownKeyPreservation() {
  const storage = new FakeLocalStorage();
  const owner = fixture.owners.primary;
  storage.setItem(scopedKey(owner, fixture.storageKeys.unknownExtension), encode(fixture.unknownExtensionValue));
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  assertOwnerStorage(storage, owner, fixture.storageKeys.unknownExtension, fixture.unknownExtensionValue);
}

async function schemaVersionPresent() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  const raw = storage.getItem(scopedKey(fixture.owners.primary, fixture.storageKeys.schemaVersion));
  assert.notEqual(raw, null, 'schema version key must be written');
  const schema = Number(JSON.parse(raw));
  assert.ok(Number.isInteger(schema) && schema > 0, 'schema version must be a positive integer');
}

async function perKeyWritesNotBlob() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  const owner = fixture.owners.primary;
  const keys = fixture.storageKeys;
  const beforeCounts = new Map(storage.setCounts);
  first.facade.setItem(keys.timeframes, encode(fixture.concurrentPins.timeframes));
  storage.setItem(scopedKey(owner, keys.tools), encode(fixture.concurrentPins.tools));
  assert.equal(storage.setCounts.get(scopedKey(owner, keys.pinbarOpen)), beforeCounts.get(scopedKey(owner, keys.pinbarOpen)), 'pinbar open must not be rewritten by a timeframe-only write');
  assert.equal(storage.setCounts.get(scopedKey(owner, keys.pinbarPos)), beforeCounts.get(scopedKey(owner, keys.pinbarPos)), 'pinbar pos must not be rewritten by a timeframe-only write');
  const second = await mount({ storage });
  const pins = readPins(second.facade);
  assertDeepEqual(pins.timeframes, fixture.concurrentPins.timeframes, 'timeframe writer must survive');
  assertDeepEqual(pins.tools, fixture.concurrentPins.tools, 'concurrent tools writer must survive');
  assertDeepEqual(pins.pinbarOpen, fixture.ownerOnePins.pinbarOpen, 'unrelated open state must survive');
  assertDeepEqual(pins.pinbarPos, fixture.ownerOnePins.pinbarPos, 'unrelated position must survive');
}

async function boundedSize() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  requireFacade(first.facade);
  const key = fixture.storageKeys.timeframes;
  first.facade.setItem(key, encode(fixture.oversizedPins.timeframes));
  const stored = decode(storage.getItem(scopedKey(fixture.owners.primary, key)), []);
  assert.ok(
    !Array.isArray(stored) || stored.length < fixture.oversizedPins.timeframes.length,
    'oversized pin list must be rejected or clamped, not stored as-is'
  );
}

async function killSwitchOffPath() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage, killSwitch: true });
  if (first.facade) await writePins(first.facade, fixture.ownerOnePins);
  const second = await mount({ storage, killSwitch: true });
  if (second.facade) assertPinsEqual(readPins(second.facade), fixture.defaults, fixture.cells[10].name);
  assertNoSchemaVersion(storage, fixture.owners.primary);
}

async function resetPath() {
  const storage = new FakeLocalStorage();
  const first = await mount({ storage });
  await writePins(first.facade, fixture.ownerOnePins);
  await mount({ storage, search: `?${fixture.resetQuery}` });
  for (const key of allPinKeys()) {
    assert.equal(storage.getItem(scopedKey(fixture.owners.primary, key)), null, `reset must clear ${key}`);
  }
  assert.equal(storage.getItem(scopedKey(fixture.owners.primary, fixture.storageKeys.schemaVersion)), null, 'reset must clear schema version');
}

async function assertFreshModuleIsolation() {
  const firstStorage = new FakeLocalStorage();
  const first = await mount({ storage: firstStorage });
  await writePins(first.facade, fixture.ownerOnePins);

  const secondStorage = new FakeLocalStorage();
  const second = await mount({ storage: secondStorage });
  requireFacade(second.facade);
  assert.notEqual(second.facade, first.facade, 'fresh module execution must publish a new facade object');
  assertPinsEqual(readPins(second.facade), fixture.defaults, 'fresh module isolation');
}

const cellRunners = new Map([
  ['B-M15-01', sameOwnerRefresh],
  ['B-M15-02', sameOwnerExitReenter],
  ['B-M15-03', sameOwnerNewSession],
  ['B-M15-04', ownerIsolation],
  ['B-M15-05', unresolvedOwnerAtBoot],
  ['B-M15-06', failedOrEmptyReadNotAuthoritative],
  ['B-M15-07', unknownKeyPreservation],
  ['B-M15-08', schemaVersionPresent],
  ['B-M15-09', perKeyWritesNotBlob],
  ['B-M15-10', boundedSize],
  ['B-M15-11', killSwitchOffPath],
  ['B-M15-12', resetPath],
]);

function formatFailureDetail(error, loadErrors) {
  const firstLine = String(error && error.message ? error.message : error).split('\n')[0];
  if (!loadErrors || loadErrors.length === 0) return firstLine;
  return `${firstLine}; loadErrors=${summarizeLoadErrors(loadErrors)}`;
}

function failureCause(detail) {
  if (String(detail).includes('product modules never executed')) return 'harness artefact';
  return 'product behaviour';
}

function emitChildResult(result) {
  console.log(`${CHILD_RESULT_PREFIX}${JSON.stringify(result)}`);
}

function parseChildResult(stdout) {
  const line = String(stdout)
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(CHILD_RESULT_PREFIX));
  if (!line) return null;
  return JSON.parse(line.slice(CHILD_RESULT_PREFIX.length));
}

function summarizeChildFailure(child) {
  const stderr = String(child.stderr || '').trim().split(/\r?\n/).filter(Boolean)[0];
  const stdout = String(child.stdout || '').trim().split(/\r?\n/).filter(Boolean)[0];
  return stderr || stdout || `child exited with status ${child.status}`;
}

function runChild(args) {
  return spawnSync(process.execPath, [__filename, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    timeout: CHILD_TIMEOUT_MS,
    windowsHide: true,
  });
}

function runChildResult(args, label) {
  const child = runChild(args);
  const parsed = parseChildResult(child.stdout);
  if (parsed) return parsed;
  const detail = child.error
    ? `${label} child process failed: ${child.error.message}`
    : `${label} child process produced no verdict: ${summarizeChildFailure(child)}`;
  return { status: 'FAIL', detail, cause: 'harness artefact' };
}

async function runChildCell(cellId) {
  const cell = fixture.cells.find((entry) => entry.id === cellId);
  const runner = cellRunners.get(cellId);
  const cellLoadErrors = [];
  currentCellLoadErrors = cellLoadErrors;
  try {
    assert.ok(cell, `Unknown cell ${cellId}`);
    assert.equal(typeof runner, 'function', `No runner registered for ${cellId}`);
    await runner();
    emitChildResult({ cellId, status: 'PASS', detail: 'contract satisfied', cause: 'product behaviour' });
  } catch (error) {
    const detail = formatFailureDetail(error, cellLoadErrors);
    emitChildResult({ cellId, status: 'FAIL', detail, cause: failureCause(detail) });
    process.exitCode = 1;
  } finally {
    currentCellLoadErrors = null;
  }
}

async function runIsolationWriteProbe() {
  try {
    const storage = new FakeLocalStorage();
    const first = await mount({ storage });
    await writePins(first.facade, fixture.ownerOnePins);
    assertPinsEqual(readPins(first.facade), fixture.ownerOnePins, 'isolation write probe');
    emitChildResult({ status: 'PASS', detail: 'wrote owner pins inside first child process', cause: 'harness artefact' });
  } catch (error) {
    emitChildResult({ status: 'FAIL', detail: formatFailureDetail(error, null), cause: 'harness artefact' });
    process.exitCode = 1;
  }
}

async function runIsolationReadProbe() {
  try {
    await assertFreshModuleIsolation();
    emitChildResult({ status: 'PASS', detail: 'fresh child saw defaults, not prior child pins', cause: 'harness artefact' });
  } catch (error) {
    emitChildResult({ status: 'FAIL', detail: formatFailureDetail(error, null), cause: 'harness artefact' });
    process.exitCode = 1;
  }
}

function runIsolationProof() {
  const write = runChildResult(['--b-m15-isolation-write'], 'isolation write');
  const read = runChildResult(['--b-m15-isolation-read'], 'isolation read');
  if (write.status === 'PASS' && read.status === 'PASS') {
    return {
      status: 'PASS',
      detail: 'child process per cell; owner pins written in one process were not visible in the next',
    };
  }
  return {
    status: 'FAIL',
    detail: [write, read]
      .filter((result) => result.status !== 'PASS')
      .map((result) => result.detail)
      .join(' | '),
  };
}

async function run() {
  const childMode = process.argv[2];
  if (childMode === '--b-m15-child-cell') {
    await runChildCell(process.argv[3]);
    return;
  }
  if (childMode === '--b-m15-isolation-write') {
    await runIsolationWriteProbe();
    return;
  }
  if (childMode === '--b-m15-isolation-read') {
    await runIsolationReadProbe();
    return;
  }

  const isolation = runIsolationProof();
  console.log(`Isolation proof: ${isolation.status} - ${isolation.detail}`);
  if (isolation.status !== 'PASS') {
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const cell of fixture.cells) {
    const result = runChildResult(['--b-m15-child-cell', cell.id], cell.id);
    results.push({ cell, ...result });
  }

  console.log('B-M15 owner-scoped pin lifecycle matrix');
  for (const result of results) {
    console.log(`${result.cell.id} ${result.cell.name}: ${result.status} - ${result.cause}: ${result.detail}`);
  }
  const passed = results.filter((result) => result.status === 'PASS').length;
  const failed = results.length - passed;
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(`B-M15 red contract failed: ${failed} cell(s) failing`);
    process.exitCode = 1;
  }
}

await run();
