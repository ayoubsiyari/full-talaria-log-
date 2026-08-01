#!/usr/bin/env node
/**
 * DEF-05(b)/DEF-07 — bootstrap proceeds on defaults when the preferences fetch is late.
 *
 * WHAT WAS ACTUALLY WRONG, because the brief and the code disagreed
 * -----------------------------------------------------------------
 * The row was handed to me as "panel construction awaits the preferences fetch". It does
 * not: preferences-init.js is a fire-and-forget IIFE that runs in parallel with
 * _talariaInitializeChart, and neither the Chart constructor nor MultichartManager.addChart
 * reads preferences. Landing the literal brief would have been a fix bound to nothing.
 *
 * The real defect is one step along. _loadPreferencesOnce awaits the cloud GET with no
 * timeout and no AbortController. Every FAILURE already lands on defaults -- 403, 5xx, a
 * non-ok response and a thrown transport error all fall through to loadFromLocalStorage()
 * and set isLoaded. A request that never SETTLES did not. Because loadPreferences() is
 * single-flight, _inflightLoad then never clears and every later caller in the page awaits
 * the same dead promise, so preferencesLoaded is never dispatched and every consumer gated
 * on readiness is stuck for the session. "Late" and "failed" look identical to a user
 * watching an unpainted panel; now they behave identically too.
 *
 * Second hole, same shape: initializePreferences' catch logged and stopped. Swallowing the
 * error was not the bug -- swallowing the EVENT was.
 *
 * BIND-01. Each behavioural cell is run twice: once against the shipped file, and once
 * against the file with the fix disabled by its own kill-switch. A cell that cannot be made
 * to fail is not evidence, so the RED run is asserted here rather than described.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const CANON = path.join(ROOT, 'chart v 1.4', 'chart', 'modules');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules');

let pass = 0;
let fail = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n          expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
};

/** A DOM-ish sandbox just wide enough for the manager to run. */
function makeSandbox({ fetchImpl, killSwitch = false }) {
  const store = new Map();
  // _loadPreferencesOnce only enters the cloud branch when a token is present. Without this
  // seed every cell resolves instantly down the localStorage path and the timing assertions
  // pass while the timeout under test is never exercised -- the first draft of this file did
  // exactly that, and the discriminating cell below is what exposed it.
  store.set('token', 'test-token');
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const events = [];
  const win = {
    __TALARIA_PREFS_BOOTSTRAP_TIMEOUT_MS: 300,
    localStorage: storage,
    dispatchEvent: (e) => { events.push(e); return true; },
    addEventListener() {},
  };
  if (killSwitch) win.__TALARIA_DISABLE_PREFS_BOOTSTRAP_TIMEOUT_V1 = true;
  win.window = win;
  win.parent = win;
  win.top = win;
  const sandbox = {
    window: win,
    localStorage: storage,
    userStorage: storage,
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    console: { log() {}, warn() {}, error() {}, info() {} },
    __events: events,
  };
  sandbox.globalThis = sandbox;
  return { sandbox, events, store };
}

function loadManager(opts) {
  const { sandbox, events } = makeSandbox(opts);
  const src = fs.readFileSync(path.join(CANON, 'preferences-sync.js'), 'utf8');
  const ctx = vm.createContext(sandbox);
  vm.runInContext(`${src}\n;globalThis.__Mgr = PreferencesSyncManager;`, ctx, { filename: 'preferences-sync.js' });
  return { Mgr: sandbox.__Mgr, sandbox, events };
}

/**
 * A request that never answers, modelled the way fetch actually behaves: it settles only if
 * its signal aborts, and then it REJECTS with an AbortError. A stub that ignores the signal
 * would make the fix look broken here while it works in a browser.
 */
const NEVER_SETTLES = (_url, init) => new Promise((_resolve, reject) => {
  const signal = init && init.signal;
  if (!signal) return;
  const onAbort = () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    reject(err);
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
});
const withTimeoutFlag = (p, ms) => Promise.race([
  p.then((v) => ({ settled: true, v })),
  new Promise((r) => setTimeout(() => r({ settled: false }), ms)),
]);

console.log('\n=== PRESENT: the switch and the bound are declared in the shipped file ===');
{
  const src = fs.readFileSync(path.join(CANON, 'preferences-sync.js'), 'utf8');
  check('prefsBootstrapTimeoutV1Enabled exists', /prefsBootstrapTimeoutV1Enabled\s*\(/.test(src), true);
  check('and reads __TALARIA_DISABLE_PREFS_BOOTSTRAP_TIMEOUT_V1',
    src.includes('__TALARIA_DISABLE_PREFS_BOOTSTRAP_TIMEOUT_V1'), true);
  check('and climbs the realm chain, so a host switch reaches every panel',
    /prefsBootstrapTimeoutV1Enabled[\s\S]{0,900}window\.top/.test(src), true);
  check('the GET is given an AbortController signal', /signal:\s*controller\.signal/.test(src), true);
  check('and the timer is cleared on every exit, leaving nothing armed for the soak',
    /finally\s*\{[\s\S]{0,160}clearTimeout\(bootstrapTimer\)/.test(src), true);
}

console.log('\n=== BOUND: a GET that never settles still reaches defaults ===');
{
  const { Mgr } = loadManager({ fetchImpl: NEVER_SETTLES });
  const m = new Mgr();
  m.__proto__.getLocalItem = function (k, d) { return d; };
  const t0 = Date.now();
  const r = await withTimeoutFlag(m.loadPreferences(), 3000);
  const ms = Date.now() - t0;
  check('loadPreferences resolves rather than hanging forever', r.settled, true);
  check('and does so on the bound, not on a network that never answers', ms < 2500, true);
  check('isLoaded is true, so consumers gated on readiness proceed', m.isLoaded, true);
  check('preferences is a populated defaults object, not null', !!(m.preferences && typeof m.preferences === 'object'), true);
  check('and carries real default fields', Array.isArray((m.preferences || {}).timeframe_favorites), true);
  check('the single-flight slot is released, so later callers are not stuck behind a dead promise',
    m._inflightLoad, null);
}

console.log('\n=== DISCRIMINATING: with the fix disabled by its own switch, the same cell hangs ===');
{
  const { Mgr } = loadManager({ fetchImpl: NEVER_SETTLES, killSwitch: true });
  const m = new Mgr();
  m.__proto__.getLocalItem = function (k, d) { return d; };
  const r = await withTimeoutFlag(m.loadPreferences(), 1500);
  check('the switch really is off', m.prefsBootstrapTimeoutV1Enabled(), false);
  check('THE RED: without the bound, loadPreferences never resolves', r.settled, false);
  check('which is the pre-fix behaviour this row exists to remove', r.settled, false);
}

console.log('\n=== NO FALSE POSITIVE: a healthy GET is not aborted ===');
{
  const okFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, preferences: { timeframe_favorites: ['1m', '5m'] } }),
  });
  const { Mgr } = loadManager({ fetchImpl: okFetch });
  const m = new Mgr();
  m.__proto__.getLocalItem = function (k, d) { return d; };
  m.__proto__.persistLoadedPreferencesToLocalStorage = function () {};
  m.__proto__.queueMergedFieldsForSync = function () {};
  const r = await withTimeoutFlag(m.loadPreferences(), 2000);
  check('a fast, healthy response still resolves', r.settled, true);
  check('and the cloud value is the one kept, so the bound did not cost correctness',
    JSON.stringify(m.preferences.timeframe_favorites), JSON.stringify(['1m', '5m']));
}

console.log('\n=== the bootstrap announces readiness even when the load throws ===');
{
  const src = fs.readFileSync(path.join(CANON, 'preferences-init.js'), 'utf8');
  const events = [];
  const win = {
    dispatchEvent: (e) => { events.push(e); return true; },
    preferencesSync: {
      isLoaded: false,
      preferences: null,
      loadPreferences: async () => { throw new Error('cloud down'); },
      loadFromLocalStorage: () => ({ timeframe_favorites: [] }),
    },
  };
  win.window = win;
  const sandbox = {
    window: win,
    console: { log() {}, warn() {}, error() {} },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    userStorage: { getItem: () => null, setItem() {} },
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src, ctx, { filename: 'preferences-init.js' });
  await new Promise((r) => setTimeout(r, 60));
  check('preferencesLoaded is dispatched despite the throw', events.some((e) => e.type === 'preferencesLoaded'), true);
  check('and the detail is a populated object rather than null',
    !!(events.find((e) => e.type === 'preferencesLoaded') || {}).detail, true);
  check('and the manager is marked loaded, so isReady() consumers unblock', win.preferencesSync.isLoaded, true);

  // The RED for this cell: the pre-fix bootstrap logged and stopped.
  const preFix = src.replace(/\} catch \(error\) \{[\s\S]*\n\}\)\(\);/, `} catch (error) {\n        console.error('x', error);\n    }\n})();`);
  const events2 = [];
  const win2 = { ...win, dispatchEvent: (e) => { events2.push(e); return true; } };
  win2.window = win2;
  win2.preferencesSync = { ...win.preferencesSync, isLoaded: false };
  const sb2 = { ...sandbox, window: win2 };
  sb2.globalThis = sb2;
  vm.runInContext(preFix, vm.createContext(sb2), { filename: 'preferences-init.prefix.js' });
  await new Promise((r) => setTimeout(r, 60));
  check('THE RED: the pre-fix bootstrap dispatches nothing, stranding every waiter',
    events2.some((e) => e.type === 'preferencesLoaded'), false);
}

console.log('\n=== MIRRORED: the browser runs what was reviewed here ===');
for (const f of ['preferences-sync.js', 'preferences-init.js']) {
  const a = fs.readFileSync(path.join(CANON, f));
  const b = fs.readFileSync(path.join(MIRROR, f));
  check(`${f} byte-identical canonical vs mirror`, a.equals(b), true);
}

console.log(`\n================ DEF-05(b)/DEF-07: ${pass} passed, ${fail} failed ================\n`);
process.exitCode = fail === 0 ? 0 : 1;
