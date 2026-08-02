/**
 * PREFS-CLOUD-FAILURE-CAP — bound the calls a realm makes to a failing
 * /api/chart/preferences.
 *
 * Origin: canary b103. The endpoint answered 500 on every request
 * (psycopg2 UndefinedColumn — user_preferences.indicator_settings_templates
 * missing from the deployed table). 31 of 31 authenticated GETs failed. The
 * client's response was to call it again on the next load, and because each
 * multichart panel is its own realm running its own PreferencesSyncManager, one
 * broken endpoint produced one failed request per panel per rebuild plus a
 * console line for each. The server defect is repaired separately; this gate is
 * about the client not amplifying the next one.
 *
 * Kill-switch: window.__TALARIA_DISABLE_PREFS_CLOUD_FAILURE_CAP_V1 = <truthy>
 * restores unbounded calling. Read per call, and read across realms, because an
 * operator flips the switch on the host page while the managers live in panels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(HERE, 'preferences-sync.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');
const SWITCH = '__TALARIA_DISABLE_PREFS_CLOUD_FAILURE_CAP_V1';

function note(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    __map: map,
  };
}

/**
 * Realm shape:
 *   panel: false      top-level page — window === parent === top
 *   panel: true       panel realm — one distinct host above (parent === top)
 *   panel: 'nested'   panel inside a container — window, parent, top all differ
 * `killIn` says which realm carries the switch: 'self' | 'parent' | 'top'.
 * `hostileParent` makes the parent chain throw, as a cross-origin realm does.
 */
function load({
  source = SOURCE,
  kill = false,
  killIn = 'self',
  panel = false,
  hostileParent = false,
  responses = [],
  token = 'test-token',
} = {}) {
  const storage = fakeStorage(token ? { token } : {});
  const calls = [];
  const queue = [...responses];

  const makeResponse = (spec) => {
    const status = typeof spec === 'number' ? spec : spec.status;
    const body = (typeof spec === 'object' && spec.body) || { success: true, preferences: {} };
    return {
      status,
      ok: status >= 200 && status < 300,
      statusText: `status ${status}`,
      json: async () => body,
    };
  };

  const fetchImpl = async (url, init) => {
    calls.push({ url, method: (init && init.method) || 'GET' });
    const spec = queue.length ? queue.shift() : 500;
    if (spec === 'throw') throw new Error('network down');
    return makeResponse(spec);
  };

  const windowObj = {
    fetch: fetchImpl,
    localStorage: storage,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h),
    location: { search: '', href: 'http://localhost/chart/index.html' },
  };
  if (kill && killIn === 'self') windowObj[SWITCH] = true;

  let hostWindow = null;
  let topWindow = null;
  if (panel) {
    hostWindow = {};
    if (kill && killIn === 'parent') hostWindow[SWITCH] = true;
    if (panel === 'nested') {
      topWindow = {};
      if (kill && killIn === 'top') topWindow[SWITCH] = true;
      hostWindow.parent = topWindow;
      hostWindow.top = topWindow;
      topWindow.parent = topWindow;
      topWindow.top = topWindow;
    } else {
      topWindow = hostWindow;
      if (kill && killIn === 'top') hostWindow[SWITCH] = true;
      hostWindow.parent = hostWindow;
      hostWindow.top = hostWindow;
    }
  } else {
    hostWindow = windowObj;
    topWindow = windowObj;
  }

  if (hostileParent) {
    Object.defineProperty(windowObj, 'parent', {
      get() { throw new Error('cross-origin'); },
    });
    Object.defineProperty(windowObj, 'top', {
      get() { throw new Error('cross-origin'); },
    });
  } else {
    windowObj.parent = hostWindow;
    windowObj.top = topWindow;
  }

  const warnings = [];
  const context = {
    window: windowObj,
    localStorage: storage,
    userStorage: fakeStorage(),
    fetch: fetchImpl,
    console: {
      log: () => {},
      warn: (...a) => warnings.push(a.join(' ')),
      info: () => {},
      error: () => {},
    },
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
    JSON,
    Object,
    Array,
    Promise,
    Error,
    Date,
    Math,
    Number,
    String,
    Boolean,
    URLSearchParams,
    document: { addEventListener: () => {} },
  };
  context.globalThis = context;

  const script = new vm.Script(
    `${source}\n;globalThis.__PSM = PreferencesSyncManager;`,
    { filename: 'preferences-sync.js' },
  );
  vm.createContext(context);
  script.runInContext(context);

  const Manager = context.__PSM;
  assert.ok(typeof Manager === 'function', 'PreferencesSyncManager must load');
  const mgr = new Manager();
  return { mgr, calls, warnings, windowObj, storage, Manager };
}

/** Mutate the real source; refuse to run if the anchor moved. */
function replaceOnce(source, needle, replacement) {
  const first = source.indexOf(needle);
  if (first < 0) {
    const err = new Error(`mutation anchor missing, re-anchor the cell: ${needle}`);
    err.mutationTargetMissing = true;
    throw err;
  }
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`mutation anchor is not unique: ${needle}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

test('flag name and cap constant are grep-clean in the product file', () => {
  assert.match(SOURCE, new RegExp(SWITCH));
  assert.match(SOURCE, /MAX_CLOUD_FAILURES = 2/);
  assert.match(SOURCE, /prefsCloudFailureCapV1Enabled/);
  note('flag-present', true, SWITCH);
});

test('cap ON: repeated 500s stop after MAX_CLOUD_FAILURES, prefs still load locally', async () => {
  const { mgr, calls } = load({ responses: [500, 500, 500, 500, 500] });
  for (let i = 0; i < 5; i += 1) {
    const prefs = await mgr.loadPreferences();
    assert.ok(prefs && typeof prefs === 'object', 'localStorage fallback still returns preferences');
  }
  assert.equal(calls.length, 2, 'exactly MAX_CLOUD_FAILURES requests reach the network');
  assert.equal(mgr._cloudCallsSuspended(), true);
  note('cap-on-bounds-requests', true, `calls=${calls.length}`);
});

test('cap ON: one console line, not one per attempt', async () => {
  const { mgr, warnings } = load({ responses: [500, 500, 500, 500] });
  for (let i = 0; i < 4; i += 1) await mgr.loadPreferences();
  const capLines = warnings.filter((w) => w.includes('Cloud preferences unavailable'));
  assert.equal(capLines.length, 1, 'the give-up notice is said once per realm per session');
  note('cap-on-single-notice', true, `notices=${capLines.length}`);
});

test('kill-switch truthy on own window: calls are unbounded again', async () => {
  const { mgr, calls } = load({ kill: true, responses: [500, 500, 500, 500, 500] });
  assert.equal(mgr.prefsCloudFailureCapV1Enabled(), false);
  for (let i = 0; i < 5; i += 1) await mgr.loadPreferences();
  assert.equal(calls.length, 5, 'with the cap killed every load calls the endpoint');
  note('kill-restores-unbounded', true, `calls=${calls.length}`);
});

test('kill-switch is truthy, not === true (a runbook writes = 1)', async () => {
  const { mgr, windowObj } = load({ responses: [500, 500, 500] });
  windowObj[SWITCH] = 1;
  assert.equal(mgr.prefsCloudFailureCapV1Enabled(), false, '= 1 must disable the cap');
  windowObj[SWITCH] = 0;
  assert.equal(mgr.prefsCloudFailureCapV1Enabled(), true, 'falsy leaves the cap on');
  note('flag-polarity', true);
});

test('host-side kill reaches a panel realm', async () => {
  const { mgr, calls } = load({
    kill: true, killIn: 'parent', panel: true, responses: [500, 500, 500, 500],
  });
  assert.equal(mgr.prefsCloudFailureCapV1Enabled(), false,
    'a switch set on the host must disable the cap inside the panel');
  for (let i = 0; i < 4; i += 1) await mgr.loadPreferences();
  assert.equal(calls.length, 4);
  note('host-kill-reaches-panel', true);
});

test('kill on window.top reaches a nested panel realm; clean realms stay capped', async () => {
  const killed = load({ kill: true, killIn: 'top', panel: 'nested', responses: [500, 500, 500] });
  assert.equal(killed.mgr.prefsCloudFailureCapV1Enabled(), false);

  const clean = load({ panel: 'nested', responses: [500, 500, 500, 500] });
  assert.equal(clean.mgr.prefsCloudFailureCapV1Enabled(), true,
    'the presence of realms above must not by itself disable the cap');
  for (let i = 0; i < 4; i += 1) await clean.mgr.loadPreferences();
  assert.equal(clean.calls.length, 2);
  note('top-kill-reaches-nested', true);
});

test('an unreadable cross-origin parent must not disable the cap', async () => {
  const { mgr, calls } = load({ hostileParent: true, responses: [500, 500, 500, 500] });
  assert.equal(mgr.prefsCloudFailureCapV1Enabled(), true,
    'a realm we cannot read is not carrying an instruction for us');
  for (let i = 0; i < 4; i += 1) await mgr.loadPreferences();
  assert.equal(calls.length, 2);
  note('cross-origin-parent-fails-safe', true);
});

test('single-flight: concurrent boot callers share one request', async () => {
  const { mgr, calls } = load({ responses: [200, 200, 200] });
  await Promise.all([mgr.loadPreferences(), mgr.loadPreferences(), mgr.loadPreferences()]);
  assert.equal(calls.length, 1, 'three concurrent callers issue one GET');
  note('single-flight', true, `calls=${calls.length}`);
});

test('a success clears the cap — one transient 5xx does not cost the session', async () => {
  const { mgr, calls } = load({ responses: [500, 200, 500, 500, 500] });
  await mgr.loadPreferences();            // 500 -> count 1
  await mgr.loadPreferences();            // 200 -> reset
  assert.equal(mgr._cloudFailureCount, 0);
  await mgr.loadPreferences();            // 500 -> 1
  await mgr.loadPreferences();            // 500 -> 2, suspend
  await mgr.loadPreferences();            // suppressed
  assert.equal(calls.length, 4);
  assert.equal(mgr._cloudCallsSuspended(), true);
  note('success-resets-cap', true, `calls=${calls.length}`);
});

test('transport failures count towards the cap too', async () => {
  const { mgr, calls } = load({ responses: ['throw', 'throw', 'throw'] });
  await mgr.loadPreferences();
  await mgr.loadPreferences();
  await mgr.loadPreferences();
  assert.equal(calls.length, 2, 'a thrown fetch is a failure, not a free retry');
  note('transport-failure-counts', true);
});

test('401 and 403 keep their existing meaning and do not trip the 5xx cap', async () => {
  const unauth = load({ responses: [401, 401, 401] });
  await unauth.mgr.loadPreferences();
  assert.equal(unauth.mgr._cloudFailureSuspended, false, '401 is an auth state, not an outage');

  const gated = load({ responses: [403, 403] });
  await gated.mgr.loadPreferences();
  assert.equal(gated.mgr._cloudSubscriptionBlocked, true, '403 still parks cloud sync');
  assert.equal(gated.mgr._cloudFailureSuspended, false);
  note('401-403-unchanged', true);
});

test('write path: 5xx on sync caps, and a suspended realm stops POSTing', async () => {
  const { mgr, calls } = load({ responses: [500, 500, 500, 500] });
  for (let i = 0; i < 4; i += 1) {
    mgr.pendingUpdates = { general_settings: { a: i } };
    await mgr.syncToAPI();
  }
  const posts = calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 2, 'the POST path is bounded by the same cap');
  assert.equal(mgr._cloudCallsSuspended(), true);

  mgr.pendingUpdates = { general_settings: { a: 99 } };
  mgr.scheduleSyncToAPI();
  assert.equal(mgr.syncTimer, null, 'a suspended realm does not even arm the debounce');
  note('write-path-capped', true, `posts=${posts.length}`);
});

test('mutant: without the suspend flag the storm returns', async () => {
  const mutated = replaceOnce(
    SOURCE,
    '        this._cloudFailureSuspended = true;',
    '        this._cloudFailureSuspended = false; /* MUTANT */',
  );
  const { mgr, calls } = load({ source: mutated, responses: [500, 500, 500, 500, 500] });
  for (let i = 0; i < 5; i += 1) await mgr.loadPreferences();
  assert.equal(calls.length, 5, 'the mutant reproduces the pre-fix behaviour');
  note('mutant-no-cap-storms', true, `calls=${calls.length}`);
});

test('mutant: a host-only predicate misses the panel realms', async () => {
  let mutated = replaceOnce(
    SOURCE,
    '            const parent = window.parent && window.parent !== window ? window.parent : null;\n            if (killed(parent)) return false;',
    '            const parent = null; if (killed(parent)) return false; /* MUTANT */',
  );
  mutated = replaceOnce(
    mutated,
    `            const top = window.top && window.top !== window && window.top !== parent
                ? window.top
                : null;
            if (killed(top)) return false;`,
    '            const top = null; if (killed(top)) return false; /* MUTANT */',
  );
  const { mgr } = load({ source: mutated, kill: true, killIn: 'parent', panel: true });
  assert.equal(mgr.prefsCloudFailureCapV1Enabled(), true,
    'host-only reach reports the cap still enabled inside the panel — the operator reverted nothing');
  note('mutant-host-only-misses-panel', true);
});
