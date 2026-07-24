/**
 * M20-A — timezone listener API real-browser gate (Fable correction lane).
 *
 * Zero-install: drives the locally installed Chromium-based browser
 * (Microsoft Edge / Chrome) in headless mode via CLI — puppeteer/playwright
 * are NOT installed in this repo. Serves the REAL product file
 * (modules/timezone-manager.js) from BOTH trees over a loopback HTTP server
 * and collects in-page gate results through POST /report.
 *
 * Round-3 cleanup contract:
 * - The per-tree race timeout handle is stored and cleared on EVERY
 *   success/failure path — a successful run returns promptly instead of
 *   keeping the event loop alive for the full timeout.
 * - After the exact spawned browser process tree is terminated and the
 *   loopback server/port is closed, the run-owned temp profile
 *   (m20a-tz-gate-<generated> under the OS temp root) is removed with a
 *   bounded Windows retry/backoff. Removal failure MARKS THE RUN FAILED and
 *   reports the profile basename + error class — it is never swallowed.
 * - A self-spawned injection matrix exercises success, report-error,
 *   page-crash, forced-timeout, server-failure and kill-tree paths and
 *   asserts after each: ports 8981/8982 free, no surviving browser pid,
 *   timeout cleared, and zero newly created m20a-tz-gate-* directories.
 *
 * No-write default: prints the JSON report to stdout. Explicit opt-in only:
 *   M20_A_TZ_EVIDENCE=browser node "chart v 1.4/chart/modules/m20-a-timezone-browser-gate.mjs"
 *   → docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-browser.json
 *     (atomic tmp+rename)
 *
 * STATUS: PENDING-FRESH-GPT-REVIEW — no self-accept.
 */
import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, release as osRelease } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

/** Canonical repo-root markers — ALL must exist; docs/plan3 alone is
 *  ambiguous (a nested "chart v 1.4/chart/docs/plan3" exists). */
const ROOT_MARKERS = [
  '.git',
  join('docs', 'plan3', 'PLAN3-BOARD.md'),
  join('chart v 1.4', 'chart'),
  join('homepage', 'public', 'chart'),
];

function isCanonicalRoot(dir) {
  return ROOT_MARKERS.every((m) => existsSync(join(dir, m)));
}

/**
 * Resolve the canonical repo root by walking up from this module's directory
 * (cwd-independent, so both the canonical and homepage mirror copies resolve
 * identically from any working directory). Fail closed: exactly ONE ancestor
 * may satisfy all markers; zero or multiple matches abort the gate.
 */
function findRepoRoot(start) {
  const matches = [];
  let dir = start;
  for (let i = 0; i < 16; i += 1) {
    if (isCanonicalRoot(dir)) matches.push(dir);
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  if (matches.length !== 1) {
    throw new Error(
      `canonical repo root ambiguous or missing above ${start}: `
      + `${matches.length} ancestors match [${ROOT_MARKERS.join(', ')}] — failing closed`);
  }
  return matches[0];
}
const REPO_ROOT = findRepoRoot(HERE);
const STAMP = '20260724';
const EVIDENCE_DIR = join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const EVIDENCE_OUT = join(EVIDENCE_DIR, `W4-M20-A-TIMEZONE-API-${STAMP}-browser.json`);
const DEFAULT_TIMEOUT_MS = 60000;
const PROFILE_PREFIX = 'm20a-tz-gate-';

const TREES = [
  { tree: 'canonical', chartRoot: join(REPO_ROOT, 'chart v 1.4', 'chart'), port: 8981 },
  { tree: 'homepage', chartRoot: join(REPO_ROOT, 'homepage', 'public', 'chart'), port: 8982 },
];

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

function findBrowser() {
  return BROWSER_CANDIDATES.find((p) => p && existsSync(p)) || null;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Terminate the exact spawned browser process tree; resolves with the
 *  taskkill outcome so a dead-tree second kill (kill-fail injection) has an
 *  observable, contained error path. */
function killTree(pid) {
  return new Promise((resolveKill) => {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], (err) => {
        resolveKill({ ok: !err, errorClass: err ? 'TASKKILL-NONZERO' : null });
      });
    } else {
      try {
        process.kill(pid, 'SIGKILL');
        resolveKill({ ok: true, errorClass: null });
      } catch (err) {
        resolveKill({ ok: false, errorClass: err.code || err.name || 'KILL-ERROR' });
      }
    }
  });
}

function sleep(ms) {
  return new Promise((r) => { setTimeout(r, ms); });
}

/** Poll until the pid no longer exists (taskkill is asynchronous). */
async function pidGone(pid, budgetMs = 5000) {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch (_) {
      return true; // ESRCH/EPERM → not our live child anymore
    }
    if (Date.now() >= deadline) return false;
    await sleep(100);
  }
}

/**
 * Remove the run-owned temp profile with bounded retry/backoff (Windows
 * browsers can hold file locks briefly after process exit). Returns
 * { removed, attempts, errorClass } — the caller must treat removed=false
 * as a run failure; this helper never throws and never swallows silently.
 */
async function removeProfileWithRetry(profileDir) {
  const delays = [100, 200, 400, 800, 1600, 2000, 2000, 2000];
  let errorClass = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 0 });
      if (!existsSync(profileDir)) {
        return { removed: true, attempts: attempt + 1, errorClass: null };
      }
      errorClass = 'RESIDUAL-AFTER-RM';
    } catch (err) {
      errorClass = err.code || err.name || 'RM-ERROR';
    }
    await sleep(delays[attempt]);
  }
  return { removed: !existsSync(profileDir), attempts: delays.length, errorClass };
}

/** Count harness-owned profile dirs currently under the OS temp root. */
function tempProfileCensus() {
  try {
    return readdirSync(tmpdir()).filter((n) => n.startsWith(PROFILE_PREFIX)).length;
  } catch (_) {
    return -1;
  }
}

/** True when nothing is listening on 127.0.0.1:port (bind-probe). */
function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

// In-page gate script (classic script; no backticks; posts rows to /report).
const PAGE_JS = String.raw`
(function () {
  var rows = [];
  function row(name, pass, detail) {
    rows.push({ name: name, pass: !!pass, detail: String(detail === undefined ? '' : detail) });
  }
  function len(tm) {
    return tm && typeof tm._m20ATimezoneListenerCensus === 'function'
      ? tm._m20ATimezoneListenerCensus()
      : tm.listeners.length;
  }
  try {
    var tm = window.timezoneManager;
    row('product-loaded', !!tm && typeof tm.subscribe === 'function',
      typeof (tm && tm.subscribe));
    row('pass-budget-8', tm.NOTIFY_PASS_BUDGET === 8, tm.NOTIFY_PASS_BUDGET);

    var base = len(tm);

    // 1,000-cycle census with real AbortControllers on odd cycles
    for (var i = 0; i < 1000; i += 1) {
      if (i % 2 === 0) {
        tm.subscribe(function () {})();
      } else {
        var ac = new AbortController();
        tm.subscribe(function () {}, { signal: ac.signal });
        ac.abort();
      }
    }
    row('census-1000-flat', len(tm) === base, len(tm));

    // real AbortSignal lifecycle
    var hits = 0;
    var ac2 = new AbortController();
    var unsub = tm.subscribe(function () { hits += 1; }, { signal: ac2.signal });
    tm.setTimezone('Europe/Paris');
    ac2.abort();
    ac2.abort(); // repeated abort
    unsub();     // post-abort unsub no-op
    tm.setTimezone('Asia/Tokyo');
    row('real-abort-removes-once', len(tm) === base && hits === 1, 'hits=' + hits);

    // malformed signals fail closed without throwing
    var threw = false;
    try {
      tm.subscribe(function () {}, { signal: { get aborted() { throw new Error('x'); }, addEventListener: function () {}, removeEventListener: function () {} } });
      tm.subscribe(function () {}, { signal: {} });
      tm.subscribe(function () {}, { signal: { aborted: false } });
    } catch (e) { threw = true; }
    row('malformed-signal-fail-closed', !threw && len(tm) === base, 'len=' + len(tm));

    // synchronous abort dispatched during attach
    var retained = null;
    var syncHits = 0;
    tm.subscribe(function () { syncHits += 1; }, {
      signal: {
        aborted: false,
        addEventListener: function (t, h) { retained = h; h(); },
        removeEventListener: function () {}
      }
    });
    tm.setTimezone('Europe/Paris');
    var inertOk = true;
    try { retained(); retained(); } catch (e) { inertOk = false; }
    row('sync-abort-attach-flat-inert', len(tm) === base && syncHits === 0 && inertOk,
      'len=' + len(tm) + ' hits=' + syncHits);

    // STICKY ABORT (round-3 regression): the post-attach recheck getter
    // dispatches the retained abort handler, then returns false — the
    // registration must never commit and never deliver.
    var stReads = 0;
    var stRetained = null;
    var stHits = 0;
    var stRemove = 0;
    tm.subscribe(function () { stHits += 1; }, {
      signal: {
        get aborted() {
          stReads += 1;
          if (stReads >= 2 && stRetained) stRetained();
          return false;
        },
        addEventListener: function (t, h) { stRetained = h; },
        removeEventListener: function () { stRemove += 1; }
      }
    });
    var stCensus = len(tm) - base;
    tm.setTimezone('Asia/Tokyo');
    var stInert = true;
    try { stRetained(); } catch (e) { stInert = false; }
    row('sticky-abort-recheck-dispatch-never-commits',
      stCensus === 0 && stHits === 0 && len(tm) === base && stRemove === 1 && stInert,
      'census=' + stCensus + ' hits=' + stHits + ' removeCalls=' + stRemove);

    // R4: public listener Array mutation/replacement must not dispatch after
    // the final cancellation gate; internal insertion uses captured primordials.
    var pushTm = new tm.constructor();
    var pushBase = len(pushTm);
    var pushDispatched = false;
    var pushHits = 0;
    pushTm.listeners.push = function () { pushDispatched = true; throw new Error('public-push-dispatched'); };
    var pushUnsub = pushTm.subscribe(function () { pushHits += 1; });
    pushTm.setTimezone('Europe/Paris');
    row('r4-replaced-public-push-no-dispatch-inserts',
      !pushDispatched && pushHits === 1 && len(pushTm) === pushBase + 1,
      'pushDispatched=' + pushDispatched + ' hits=' + pushHits + ' len=' + len(pushTm));
    pushUnsub();

    var replaceTm = new tm.constructor();
    var replaceBase = len(replaceTm);
    var replacementDispatch = 0;
    var replaceHits = 0;
    replaceTm.listeners = { length: 999, push: function () { replacementDispatch += 1; } };
    var replaceUnsub = replaceTm.subscribe(function () { replaceHits += 1; });
    replaceTm.setTimezone('Asia/Tokyo');
    row('r4-whole-listeners-property-replacement-ignored',
      replacementDispatch === 0 && replaceHits === 1 && len(replaceTm) === replaceBase + 1,
      'replacementDispatch=' + replacementDispatch + ' hits=' + replaceHits + ' len=' + len(replaceTm));
    replaceUnsub();

    var protoTm = new tm.constructor();
    var protoBase = len(protoTm);
    var originalPush = Array.prototype.push;
    var protoDispatch = false;
    var protoHits = 0;
    var protoUnsub = null;
    Array.prototype.push = function () { protoDispatch = true; throw new Error('prototype-push-dispatched'); };
    try {
      protoUnsub = protoTm.subscribe(function () { protoHits += 1; });
    } finally {
      Array.prototype.push = originalPush;
    }
    protoTm.setTimezone('Europe/Paris');
    row('r4-replaced-array-prototype-push-no-dispatch',
      !protoDispatch && protoHits === 1 && len(protoTm) === protoBase + 1,
      'protoDispatch=' + protoDispatch + ' hits=' + protoHits + ' len=' + len(protoTm));
    protoUnsub();

    var frozenTm = new tm.constructor();
    var frozenBase = len(frozenTm);
    var frozenHits = 0;
    var frozenRemove = 0;
    var frozenRetained = null;
    var frozenThrown = null;
    Object.freeze(frozenTm.listeners);
    try {
      frozenTm.subscribe(function () { frozenHits += 1; }, {
        signal: {
          aborted: false,
          addEventListener: function (t, h) { frozenRetained = h; },
          removeEventListener: function () { frozenRemove += 1; }
        }
      });
    } catch (e) { frozenThrown = e; }
    var frozenInert = true;
    try { if (frozenRetained) frozenRetained(); } catch (e) { frozenInert = false; }
    frozenTm.setTimezone('Europe/Paris');
    row('r4-frozen-genuine-store-rethrows-and-detaches-once',
      frozenThrown instanceof TypeError && frozenHits === 0 && len(frozenTm) === frozenBase
        && frozenRemove === 1 && frozenInert,
      'thrown=' + (frozenThrown && frozenThrown.name) + ' hits=' + frozenHits
        + ' len=' + len(frozenTm) + ' removeCalls=' + frozenRemove);

    var nonWritableTm = new tm.constructor();
    var nonWritableBase = len(nonWritableTm);
    var nonWritableHits = 0;
    var nonWritableRemove = 0;
    var nonWritableThrown = null;
    Object.defineProperty(nonWritableTm.listeners, 'length', { writable: false });
    try {
      nonWritableTm.subscribe(function () { nonWritableHits += 1; }, {
        signal: {
          aborted: false,
          addEventListener: function () {},
          removeEventListener: function () { nonWritableRemove += 1; }
        }
      });
    } catch (e) { nonWritableThrown = e; }
    nonWritableTm.setTimezone('Asia/Tokyo');
    row('r4-nonwritable-genuine-store-rethrows-and-stays-inert',
      nonWritableThrown instanceof TypeError && nonWritableHits === 0 && len(nonWritableTm) === nonWritableBase
        && nonWritableRemove === 1,
      'thrown=' + (nonWritableThrown && nonWritableThrown.name) + ' hits=' + nonWritableHits
        + ' len=' + len(nonWritableTm) + ' removeCalls=' + nonWritableRemove);

    // same-timezone idempotence: no notify
    var sameHits = 0;
    var sameUnsub = tm.subscribe(function () { sameHits += 1; });
    var r = tm.setTimezone(tm.getTimezone().id);
    sameUnsub();
    row('same-tz-idempotent', r === true && sameHits === 0, 'hits=' + sameHits);

    // unconditional alternating reentrant callback bounded in real browser
    var flips = 0;
    var lastDelivered = null;
    var flipUnsub = tm.subscribe(function (tz) {
      flips += 1;
      lastDelivered = tz.id;
      tm.setTimezone(tz.id === 'Europe/Paris' ? 'Asia/Tokyo' : 'Europe/Paris');
    });
    tm.setTimezone('UTC');
    var finalOk = lastDelivered === tm.getTimezone().id;
    flipUnsub();
    row('alternating-bounded-in-browser', flips > 0 && flips <= 8 && finalOk,
      'passes=' + flips + ' final=' + String(lastDelivered));

    // kill-switch discrimination (flag read at subscribe time)
    window.__TALARIA_DISABLE_M20_A_TIMEZONE_LISTENER_UNSUB_V1 = true;
    var killBase = len(tm);
    var killUnsub = tm.subscribe(function () {});
    killUnsub();
    row('kill-cleanup-noop', len(tm) === killBase + 1, 'len=' + len(tm));
    window.__TALARIA_DISABLE_M20_A_TIMEZONE_LISTENER_UNSUB_V1 = false;
    var fixUnsub = tm.subscribe(function () {});
    fixUnsub();
    row('fix-cleanup-real', len(tm) === killBase + 1, 'len=' + len(tm));

    // DST formatting sanity in real browser Intl
    tm.setTimezone('America/New_York');
    var formatted = tm.formatTime(Date.UTC(2024, 5, 15, 14, 30, 0), 'datetime');
    row('formatTime-real-browser', typeof formatted === 'string' && /\d/.test(formatted), formatted);
  } catch (err) {
    rows.push({ name: 'page-exception', pass: false, detail: String(err && err.stack || err) });
  }
  fetch('/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ua: navigator.userAgent, rows: rows })
  });
})();
`;

// page-crash injection: the page throws before any report can be posted, so
// the run must resolve through the (injected, short) timeout path and still
// clean up completely.
const PAGE_JS_CRASH = 'throw new Error("injected-page-crash");\n';

function pageHtml() {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>M20-A TZ gate</title></head><body>',
    '<script>',
    '  // in-memory userStorage shim (bare identifier used by the product);',
    '  // never touches real localStorage.',
    '  (function () {',
    '    var store = {};',
    '    window.userStorage = {',
    '      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },',
    '      setItem: function (k, v) { store[k] = String(v); },',
    '      removeItem: function (k) { delete store[k]; }',
    '    };',
    '  })();',
    '</script>',
    '<script src="/modules/timezone-manager.js"></script>',
    '<script src="/gate.js"></script>',
    '</body></html>',
  ].join('\n');
}

function startServer({ chartRoot, port, onReport, inject }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/report') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
          try { onReport(JSON.parse(body)); } catch (e) { onReport({ error: String(e) }); }
        });
        return;
      }
      if (req.url === '/' || req.url === '/gate.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(pageHtml());
        return;
      }
      if (req.url === '/gate.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(inject === 'page-crash' ? PAGE_JS_CRASH : PAGE_JS);
        return;
      }
      if (req.url === '/modules/timezone-manager.js') {
        const abs = join(chartRoot, 'modules', 'timezone-manager.js');
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        res.end(readFileSync(abs));
        return;
      }
      res.writeHead(404);
      res.end('not found');
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Run the in-browser gate for one tree. `opts.inject` selects a fault path
 * (report-error | page-crash | timeout | server-fail | kill-fail); every
 * path — success or failure — runs the full cleanup ladder in `finally`:
 * clear timeout handle → kill exact browser tree → close server/port →
 * remove run-owned temp profile with bounded retry/backoff. Cleanup outcome
 * is reported truthfully in `cleanup` and cleanup.ok=false fails the run.
 */
async function runTree({ tree, chartRoot, port }, browserPath, opts = {}) {
  const inject = opts.inject || null;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const t0 = Date.now();
  const cleanup = {
    timeoutCleared: false,
    browserKilled: false,
    browserPidGone: false,
    secondKillExercised: false,
    secondKillErrorClass: null,
    serverClosed: false,
    profileBasename: null,
    profileRemoved: false,
    profileRemoveAttempts: 0,
    profileErrorClass: null,
    ok: false,
  };

  let server = null;
  let child = null;
  let profile = null;
  let timeoutHandle = null;
  let report = null;

  try {
    let reportResolve;
    const reportPromise = new Promise((r) => { reportResolve = r; });
    if (inject === 'server-fail') throw new Error('injected-server-failure');
    server = await startServer({
      chartRoot,
      port,
      inject,
      onReport: (rep) => {
        if (inject === 'timeout') return; // drop the report → forced timeout path
        if (inject === 'report-error') {
          reportResolve({ error: 'injected-report-error' });
          return;
        }
        reportResolve(rep);
      },
    });
    profile = await mkdtemp(join(tmpdir(), PROFILE_PREFIX));
    cleanup.profileBasename = basename(profile);
    const url = `http://127.0.0.1:${port}/gate.html`;
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      `--user-data-dir=${profile}`,
      url,
    ];
    child = spawn(browserPath, args, { stdio: 'ignore' });
    const timeout = new Promise((r) => {
      timeoutHandle = setTimeout(() => r({ error: `timeout after ${timeoutMs}ms` }), timeoutMs);
    });
    report = await Promise.race([reportPromise, timeout]);
  } catch (err) {
    report = { error: String((err && err.message) || err) };
  } finally {
    // 1. Timeout handle: stored above, cleared on EVERY path so a
    //    successful run returns promptly instead of idling out the timer.
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    cleanup.timeoutCleared = true;

    // 2. Exact spawned browser process tree.
    if (child) {
      const kill1 = await killTree(child.pid);
      cleanup.browserKilled = kill1.ok;
      if (inject === 'kill-fail') {
        // Dead-tree second kill: exercises and contains the taskkill error path.
        const kill2 = await killTree(child.pid);
        cleanup.secondKillExercised = true;
        cleanup.secondKillErrorClass = kill2.errorClass;
      }
      cleanup.browserPidGone = await pidGone(child.pid);
    } else {
      cleanup.browserKilled = true; // nothing was spawned
      cleanup.browserPidGone = true;
    }

    // 3. Server / port.
    if (server) await new Promise((r) => server.close(r));
    cleanup.serverClosed = true;

    // 4. Run-owned temp profile — bounded retry/backoff; failure is
    //    surfaced (basename + error class), never swallowed.
    if (profile) {
      const rmRes = await removeProfileWithRetry(profile);
      cleanup.profileRemoved = rmRes.removed;
      cleanup.profileRemoveAttempts = rmRes.attempts;
      cleanup.profileErrorClass = rmRes.removed ? null : rmRes.errorClass;
      if (inject === 'cleanup-rm-fail') {
        cleanup.profileRemoved = false;
        cleanup.profileErrorClass = 'INJECTED-RM-FAILURE';
      }
    } else {
      cleanup.profileRemoved = true; // never created (server-fail path)
    }

    cleanup.ok = cleanup.timeoutCleared && cleanup.browserPidGone
      && cleanup.serverClosed && cleanup.profileRemoved;
  }

  const productSha = sha256(readFileSync(join(chartRoot, 'modules', 'timezone-manager.js')));
  return {
    tree,
    url: `http://127.0.0.1:${port}/gate.html`,
    productSha256: productSha,
    report,
    durationMs: Date.now() - t0,
    cleanup,
  };
}

/** Classify a runTree report for injection-expectation matching. */
function reportKindOf(report) {
  if (!report) return 'missing';
  if (!report.error) return 'rows';
  const msg = String(report.error);
  if (msg.startsWith('timeout after')) return 'timeout';
  if (msg === 'injected-report-error') return 'injected-error';
  if (msg === 'injected-server-failure') return 'server-error';
  return 'other-error';
}

/**
 * Child mode (`--inject=<mode>`): run the canonical tree once with the given
 * fault injection and print an honest JSON summary. Exit codes:
 *   0 — success-behavior modes (success / kill-fail): all rows pass AND cleanup ok
 *   1 — expected-failure modes: fault observed AND cleanup ok
 *   3 — cleanup failed (cleanup-rm-fail mode proves FAIL-BROWSER-CLEANUP is nonzero)
 */
async function runInjectChild(mode) {
  const browserPath = findBrowser();
  if (!browserPath && mode !== 'server-fail') {
    process.stdout.write(`${JSON.stringify({ injectMode: mode, error: 'NO-BROWSER-AVAILABLE' })}\n`);
    process.exitCode = 2;
    return;
  }
  const timeoutMs = Number(process.env.M20A_TZ_GATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const res = await runTree(TREES[0], browserPath, {
    timeoutMs,
    inject: mode === 'success' ? null : mode,
  });
  const rows = (res.report && res.report.rows) || [];
  const kind = reportKindOf(res.report);
  const rowsPass = rows.filter((r) => r.pass).length;
  const behaviorOk = kind === 'rows' && rows.length > 0 && rowsPass === rows.length;
  const wouldVerdict = behaviorOk
    ? (res.cleanup.ok ? 'GREEN' : 'FAIL-BROWSER-CLEANUP')
    : 'FAIL-BROWSER';
  process.stdout.write(`${JSON.stringify({
    injectMode: mode,
    reportKind: kind,
    rowsTotal: rows.length,
    rowsPass,
    wouldVerdict,
    timeoutMs,
    durationMs: res.durationMs,
    cleanup: res.cleanup,
  })}\n`);
  if (!res.cleanup.ok) process.exitCode = 3;
  else if (behaviorOk) process.exitCode = 0;
  else process.exitCode = 1;
}

const INJECT_MATRIX = [
  { mode: 'success', expectExit: 0, expectKind: 'rows', timeoutMs: 30000 },
  { mode: 'report-error', expectExit: 1, expectKind: 'injected-error', timeoutMs: 30000 },
  { mode: 'page-crash', expectExit: 1, expectKind: 'timeout', timeoutMs: 4000 },
  { mode: 'timeout', expectExit: 1, expectKind: 'timeout', timeoutMs: 4000 },
  { mode: 'server-fail', expectExit: 1, expectKind: 'server-error', timeoutMs: 4000 },
  { mode: 'kill-fail', expectExit: 0, expectKind: 'rows', timeoutMs: 30000 },
  { mode: 'cleanup-rm-fail', expectExit: 3, expectKind: 'rows', timeoutMs: 30000, expectCleanupOk: false },
];

function spawnInjectChild(mode, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const env = { ...process.env, M20A_TZ_GATE_TIMEOUT_MS: String(timeoutMs) };
    delete env.M20_A_TZ_EVIDENCE; // children never write evidence
    execFile(process.execPath, [SELF, `--inject=${mode}`], {
      env,
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    }, (err, stdout) => {
      const wallMs = Date.now() - t0;
      const exitCode = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
      let parsed = null;
      try {
        const line = String(stdout).trim().split('\n').pop();
        parsed = JSON.parse(line);
      } catch (_) { /* parsed stays null */ }
      resolve({ exitCode, wallMs, parsed });
    });
  });
}

/**
 * Injection matrix (parent side): spawn one child gate per fault path and
 * assert the post-conditions the round-3 block demands — ports 8981/8982
 * free, timeout cleared, no surviving browser pid, profile removed, and
 * zero newly created m20a-tz-gate-* directories under the OS temp root.
 */
async function runInjectionMatrix() {
  const entries = [];
  for (const spec of INJECT_MATRIX) {
    const profilesBefore = tempProfileCensus();
    // eslint-disable-next-line no-await-in-loop
    const child = await spawnInjectChild(spec.mode, spec.timeoutMs);
    const profilesAfter = tempProfileCensus();
    // eslint-disable-next-line no-await-in-loop
    const port8981Free = await portFree(8981);
    // eslint-disable-next-line no-await-in-loop
    const port8982Free = await portFree(8982);
    const p = child.parsed;
    const cleanupOk = !!(p && p.cleanup && p.cleanup.ok
      && p.cleanup.timeoutCleared && p.cleanup.browserPidGone
      && p.cleanup.serverClosed && p.cleanup.profileRemoved);
    const cleanupMatches = spec.expectCleanupOk === false
      ? !!(p && p.cleanup && !p.cleanup.ok && p.cleanup.profileErrorClass === 'INJECTED-RM-FAILURE'
        && p.wouldVerdict === 'FAIL-BROWSER-CLEANUP')
      : cleanupOk;
    // Promptness: the child must return well before idling out the race
    // timer (success paths) / promptly after the forced timeout fires.
    const promptOk = p ? child.wallMs < spec.timeoutMs + 25000 : false;
    const ok = child.exitCode === spec.expectExit
      && !!p && p.reportKind === spec.expectKind
      && cleanupMatches
      && port8981Free && port8982Free
      && profilesAfter === profilesBefore
      && promptOk;
    entries.push({
      mode: spec.mode,
      ok,
      exitCode: child.exitCode,
      expectExit: spec.expectExit,
      reportKind: p ? p.reportKind : 'unparsed',
      expectKind: spec.expectKind,
      rowsTotal: p ? p.rowsTotal : null,
      rowsPass: p ? p.rowsPass : null,
      wouldVerdict: p ? p.wouldVerdict : null,
      childWallMs: child.wallMs,
      childDurationMs: p ? p.durationMs : null,
      injectedTimeoutMs: spec.timeoutMs,
      port8981Free,
      port8982Free,
      newProfileDirs: profilesAfter - profilesBefore,
      cleanup: p ? p.cleanup : null,
    });
  }
  return entries;
}

async function main() {
  if (process.argv.includes('--print-root')) {
    // Root-resolution probe (no browser, no writes): used by the gate suite to
    // prove canonical + homepage entrypoints resolve the same canonical root
    // from arbitrary working directories.
    process.stdout.write(`${JSON.stringify({
      entrypoint: fileURLToPath(import.meta.url),
      cwd: process.cwd(),
      repoRoot: REPO_ROOT,
      markersValidated: ROOT_MARKERS,
      trees: TREES.map((t) => ({ tree: t.tree, chartRoot: t.chartRoot, exists: existsSync(t.chartRoot) })),
    })}\n`);
    return;
  }

  const injectArg = process.argv.find((a) => a.startsWith('--inject='));
  if (injectArg) {
    await runInjectChild(injectArg.slice('--inject='.length));
    return;
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    process.stdout.write(JSON.stringify({
      fix: 'M20-A-TIMEZONE-LISTENER-API',
      mode: 'browser',
      verdict: 'NO-BROWSER-AVAILABLE',
      note: 'No local Chromium-based browser found; gate not run.',
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const gateT0 = Date.now();
  const profileCensusBefore = tempProfileCensus();
  const results = [];
  for (const t of TREES) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runTree(t, browserPath, {
      timeoutMs: Number(process.env.M20A_TZ_GATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    }));
  }
  const treesDurationMs = Date.now() - gateT0;

  const skipInject = process.env.M20A_TZ_GATE_SKIP_INJECT === '1';
  const cleanupMatrix = skipInject ? null : await runInjectionMatrix();

  const port8981Free = await portFree(8981);
  const port8982Free = await portFree(8982);
  const profileCensusAfter = tempProfileCensus();

  const allRows = results.flatMap((r) => (r.report && r.report.rows) || []);
  const failed = allRows.filter((r) => !r.pass);
  const anyError = results.some((r) => !r.report || r.report.error);
  const cleanupOk = results.every((r) => r.cleanup && r.cleanup.ok)
    && (skipInject || (cleanupMatrix && cleanupMatrix.every((m) => m.ok)))
    && port8981Free && port8982Free
    && profileCensusAfter === profileCensusBefore;
  const parity = results.length === 2 && results[0].productSha256 === results[1].productSha256;
  const behaviorOk = !anyError && failed.length === 0 && allRows.length > 0 && parity;
  const verdict = behaviorOk
    ? (cleanupOk ? 'GREEN' : 'FAIL-BROWSER-CLEANUP')
    : 'FAIL-BROWSER';

  const payload = {
    worker: 'W4',
    fix: 'M20-A-TIMEZONE-LISTENER-API',
    correction: 'FABLE-CORRECTION-OF-GPT-BLOCKED-COMPOSER-LAND (BLOCK-TIMEZONE-API)',
    mode: 'browser',
    stamp: STAMP,
    status: 'PENDING-FRESH-GPT-REVIEW',
    runtime: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      osRelease: osRelease(),
      arch: process.arch,
    },
    repoRoot: REPO_ROOT,
    cwdAtRun: process.cwd(),
    browserPath,
    dualTreeShaParity: parity,
    trees: results,
    durations: {
      treesMs: treesDurationMs,
      totalMs: Date.now() - gateT0,
      perTreeMs: results.map((r) => ({ tree: r.tree, durationMs: r.durationMs })),
    },
    cleanupCensus: {
      profileDirsBefore: profileCensusBefore,
      profileDirsAfter: profileCensusAfter,
      newProfileDirs: profileCensusAfter - profileCensusBefore,
      port8981Free,
      port8982Free,
      cleanupOk,
    },
    cleanupMatrix,
    summary: { total: allRows.length, pass: allRows.length - failed.length, fail: failed.length },
    verdict,
  };

  const body = `${JSON.stringify(payload, null, 2)}\n`;
  if (String(process.env.M20_A_TZ_EVIDENCE || '').toLowerCase() === 'browser') {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const tmp = join(EVIDENCE_DIR, `.W4-M20-A-TIMEZONE-API-${STAMP}-browser.${process.pid}.tmp`);
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, EVIDENCE_OUT);
    process.stdout.write(`Wrote evidence ${EVIDENCE_OUT} verdict=${verdict}\n`);
  } else {
    process.stdout.write(body);
  }
  if (verdict !== 'GREEN') process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exitCode = 1;
});
