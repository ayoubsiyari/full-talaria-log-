/**
 * LIFE-3 behavioural gate.
 *
 * Loads the SHIPPED chart-window-limit.js into a sandbox with a browser shim, then fires real
 * pagehide/pageshow events at it and watches what leaves the page. It asserts on the network calls the
 * module makes, not on the presence of any string I wrote — a marker-grep would pass with the guard
 * deleted, which is the PROC-3 axis-4 failure the roster is trying to stamp out.
 *
 * What this does NOT prove: that Chrome actually declines to bfcache a no-store document. That is a
 * browser behaviour, it needs a deployed build, and it is the post-deploy check on the seal build.
 * What this DOES prove is the whole client half: which events release the claim, which re-establish it,
 * and that the switch restores the old behaviour exactly.
 */
import fs from 'node:fs';
import vm from 'node:vm';

console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: SANDBOX_SIM — product source is executed here in a synthetic realm against stubs this gate wrote. Green means the logic behaves against those stubs, NOT that the shipped product does. A row can be green here and inert in the browser.');

const SRC = process.argv[2] || 'chart v 1.4/chart/modules/chart-window-limit.js';
const source = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); fail++; }
};

/** A browser shim thin enough to be auditable, complete enough that the module boots unmodified. */
function load({ switchOff = false } = {}) {
  const calls = [];            // every request the module makes, in order
  const listeners = { window: {}, document: {} };
  const store = new Map();

  const res = (status, body) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body || {}),
    clone() { return this; },
  });

  const ctx = {
    console: { log() {}, warn() {}, info() {}, error() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, Math, JSON, String, Number, Object, Array, Promise, URLSearchParams, Blob: class {},
    fetch: (url, init) => { calls.push({ kind: 'fetch', url: String(url), method: (init && init.method) || 'GET' }); return res(200, { ok: true }); },
  };
  ctx.window = {
    location: { search: '', href: 'https://x/chart/index.html' },
    crypto: { randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    navigator: { sendBeacon: (url) => { calls.push({ kind: 'beacon', url: String(url) }); return true; } },
    addEventListener: (t, f) => { (listeners.window[t] ||= []).push(f); },
    removeEventListener: () => {},
    fetch: ctx.fetch,
    WebSocket: function () {},
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    __talariaUserId: 42,
    dispatchEvent: () => true,
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
  };
  if (switchOff) ctx.window.__TALARIA_BFCACHE_DEFEAT_V1 = false;
  ctx.window.window = ctx.window;
  ctx.window.top = ctx.window;
  ctx.window.parent = ctx.window;
  ctx.self = ctx.window;
  ctx.navigator = ctx.window.navigator;
  ctx.sessionStorage = ctx.window.sessionStorage;
  ctx.WebSocket = ctx.window.WebSocket;
  ctx.Response = class { constructor(b, i) { this.body = b; Object.assign(this, i); } };
  ctx.document = {
    readyState: 'complete',
    visibilityState: 'visible',
    addEventListener: (t, f) => { (listeners.document[t] ||= []).push(f); },
  };

  vm.createContext(ctx);
  vm.runInContext(source, ctx);

  const fire = (target, type, ev = {}) => (listeners[target][type] || []).forEach((f) => f(ev));
  return {
    api: ctx.window.__talariaChartWindowLimit,
    calls,
    fire,
    listenerCount: (t, type) => (listeners[t][type] || []).length,
    releases: () => calls.filter((c) => /windows\/release/.test(c.url)),
    claims: () => calls.filter((c) => /windows\/claim/.test(c.url)),
  };
}

console.log('=== the module still boots and claims a window ===');
{
  const m = load();
  check('a claim was issued at boot', m.claims().length >= 1, true);
  check('pagehide is listened for', m.listenerCount('window', 'pagehide') >= 1, true);
  check('pageshow is listened for  (this is the new one)', m.listenerCount('window', 'pageshow') >= 1, true);
}

console.log('\n=== a real close still releases the claim (no regression) ===');
{
  const m = load();
  const before = m.releases().length;
  m.fire('window', 'pagehide', { persisted: false });
  check('pagehide persisted=false releases', m.releases().length - before, 1);
}
{
  const m = load();
  const before = m.releases().length;
  m.fire('window', 'beforeunload', {});
  check('beforeunload still releases unconditionally', m.releases().length - before, 1);
}

console.log('\n=== THE DEFECT: a bfcache freeze must not hand back the slot ===');
{
  const m = load();
  const before = m.releases().length;
  m.fire('window', 'pagehide', { persisted: true });
  check('pagehide persisted=true does NOT release', m.releases().length - before, 0);
  check('and it is recorded as a defeat failure', m.api.bfcacheStats().captured, 1);
}

console.log('\n=== restoring from bfcache re-establishes the claim instead of showing a takeover ===');
{
  const m = load();
  m.fire('window', 'pagehide', { persisted: true });
  const before = m.claims().length;
  m.fire('window', 'pageshow', { persisted: true });
  check('a persisted pageshow re-claims', m.claims().length - before, 1);
  check('and is counted', m.api.bfcacheStats().restored, 1);
}
{
  const m = load();
  const before = m.claims().length;
  m.fire('window', 'pageshow', { persisted: false });
  check('an ordinary load does NOT re-claim', m.claims().length - before, 0);
  check('and is not counted as a bfcache restore', m.api.bfcacheStats().restored, 0);
}

console.log('\n=== the switch restores the old behaviour exactly (the OFF arm for attribution) ===');
{
  const m = load({ switchOff: true });
  const before = m.releases().length;
  m.fire('window', 'pagehide', { persisted: true });
  check('with the switch off, a persisted pagehide releases again', m.releases().length - before, 1);
  check('stats report the switch as off', m.api.bfcacheStats().enabled, false);
  const c = m.claims().length;
  m.fire('window', 'pageshow', { persisted: true });
  check('and no re-claim happens', m.claims().length - c, 0);
}

console.log('\n=== discriminating: the pre-fix module must FAIL this gate ===');
{
  // Reconstruct the shipped-before behaviour - pagehide wired straight to release - and confirm the
  // assertions above actually catch it. A gate that passes against the old code proves nothing.
  const preFix = source
    .replace("window.addEventListener('pagehide', onPageHide);", "window.addEventListener('pagehide', release);")
    .replace("window.addEventListener('pageshow', onPageShow);", "");
  const changed = preFix !== source;
  check('the pre-fix variant was successfully constructed', changed, true);

  const calls = [];
  const listeners = {};
  const ctx = {
    console: { log() {}, warn() {}, info() {}, error() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    Date, Math, JSON, String, Number, Object, Array, Promise, URLSearchParams, Blob: class {},
  };
  const store = new Map();
  ctx.fetch = (u, i) => { calls.push(String(u)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }), clone() { return this; } }); };
  ctx.window = {
    location: { search: '', href: 'https://x/chart/index.html' },
    crypto: { randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    navigator: { sendBeacon: (u) => { calls.push(String(u)); return true; } },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener: () => {}, fetch: ctx.fetch, WebSocket: function () {},
    sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    __talariaUserId: 42, dispatchEvent: () => true,
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
  };
  ctx.window.window = ctx.window; ctx.window.top = ctx.window; ctx.window.parent = ctx.window;
  ctx.self = ctx.window; ctx.navigator = ctx.window.navigator; ctx.sessionStorage = ctx.window.sessionStorage;
  ctx.WebSocket = ctx.window.WebSocket;
  ctx.Response = class { constructor(b, i) { this.body = b; Object.assign(this, i); } };
  ctx.document = { readyState: 'complete', visibilityState: 'visible', addEventListener: (t, f) => { (listeners[t] ||= []).push(f); } };
  vm.createContext(ctx);
  vm.runInContext(preFix, ctx);

  const before = calls.filter((u) => /windows\/release/.test(u)).length;
  (listeners['pagehide'] || []).forEach((f) => f({ persisted: true }));
  const after = calls.filter((u) => /windows\/release/.test(u)).length;
  check('pre-fix code DOES release on a bfcache freeze (the defect, reproduced)', after - before, 1);
  check('so this gate is discriminating, not decorative', (after - before) === 1, true);
}

console.log(`\n================ LIFE-3: ${pass} passed, ${fail} failed ================`);
process.exit(fail ? 1 : 0);
