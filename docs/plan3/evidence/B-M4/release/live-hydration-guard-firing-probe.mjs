#!/usr/bin/env node
/**
 * Live product question (Director RULING-SOAK-CLASH-AND-GUARD-FIRING):
 * On deployed b82 host with a real backend, does the B-W16 durable-suppress
 * warn fire after a normal session-state hydrate + journal write?
 *
 * Credentials: TEST_EMAIL / TEST_PASSWORD from the environment only.
 * Never prints credential values. Throwaway session deleted at end when possible.
 *
 *   node docs/plan3/evidence/B-M4/release/live-hydration-guard-firing-probe.mjs \
 *     [--base-url=http://31.97.192.82:3000]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../..');
const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const out = { baseUrl: process.env.TEST_VPS_URL || 'http://31.97.192.82:3000' };
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`bad arg: ${a}`);
    if (m[1] === 'base-url') out.baseUrl = m[2];
    else if (m[1] === 'help') {
      console.log('live-hydration-guard-firing-probe.mjs [--base-url=URL]');
      process.exit(0);
    } else throw new Error(`unknown --${m[1]}`);
  }
  return out;
}

function cookieHeaderFromResponse(res) {
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [];
  const fallback = res.headers.get('set-cookie');
  const parts = raw.length ? raw : (fallback ? [fallback] : []);
  return parts.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

async function login(baseUrl, email, password) {
  const res = await fetch(new URL('/api/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  const cookie = cookieHeaderFromResponse(res);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: body?.detail || body?.message || `login HTTP ${res.status}`,
      cookie: '',
    };
  }
  if (!cookie) {
    return { ok: false, status: res.status, detail: 'login ok but no Set-Cookie', cookie: '' };
  }
  return { ok: true, status: res.status, cookie, body };
}

async function api(baseUrl, cookie, method, p, body, { chartWindowId } = {}) {
  const headers = {
    cookie,
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
  };
  if (chartWindowId) headers['X-Talaria-Chart-Window-Id'] = chartWindowId;
  let url = new URL(p, baseUrl);
  if (chartWindowId && /\/api\/sessions\/\d+\/state\/?$/.test(url.pathname)) {
    url.searchParams.set('chart_window_id', chartWindowId);
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text.slice(0, 200) }; }
  return { status: res.status, json, ok: res.ok };
}

async function claimChartWindow(baseUrl, cookie) {
  const clientId = `b-guard-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const res = await api(baseUrl, cookie, 'POST', '/api/chart/windows/claim', { client_id: clientId });
  return { ...res, clientId };
}

function installDomShim() {
  const el = () => ({
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; }, cssText: '' },
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    appendChild(c) { return c; }, removeChild(c) { return c; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; }, remove() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    innerHTML: '', textContent: '', value: '', dataset: {}, children: [],
  });
  global.performance = performance;
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  global.cancelAnimationFrame = () => {};
  global.window = {
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    location: { href: 'http://local.test/chart', search: '' },
    parent: null, chart: null, postMessage() {},
    navigator: { userAgent: 'node-live-guard-probe' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  global.document = {
    getElementById: () => el(), createElement: () => el(),
    body: el(), documentElement: el(),
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
  };
  global.window.document = global.document;
  global.userStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.HTMLElement = class {};
  global.Node = class {};
  global.CustomEvent = class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
}

function loadOrderManager() {
  installDomShim();
  const target = path.join(REPO, 'chart v 1.4/chart/modules/order-manager.js');
  return require(target);
}

function makeLiveOm(OrderManager, { sessionId, baseUrl, cookie, chartWindowId, network }) {
  const proto = (n) => OrderManager.prototype[n];
  const realInit = OrderManager.prototype.init;
  OrderManager.prototype.init = function () {};
  let om;
  try {
    om = new OrderManager({
      getActiveTradingSessionId: () => sessionId,
    }, { isActive: false });
  } finally {
    OrderManager.prototype.init = realInit;
  }

  const warns = [];
  const durablePatches = [];
  const hotPatches = [];

  om.chart = {
    getActiveTradingSessionId: () => sessionId,
    scheduleSessionStateSave(patch) { hotPatches.push(patch); },
    queueCriticalSessionStateSave(patch) {
      durablePatches.push(patch);
      // Product does not await this; we track the network promise separately.
      const p = api(
        baseUrl, cookie, 'PATCH', `/api/sessions/${sessionId}/state`, patch,
        { chartWindowId },
      ).then((res) => {
        network.durablePatches.push({ status: res.status, ok: res.ok, detail: res.json?.detail });
        return res;
      });
      network.pending.push(p);
    },
  };
  // Ensure real methods (constructor may bind some; keep prototypes for commit/persist).
  om.persistJournal = proto('persistJournal');
  om._m19CommitJournalArray = proto('_m19CommitJournalArray');

  return { om, warns, durablePatches, hotPatches, captureWarn() {
    const real = console.warn;
    console.warn = (...a) => {
      const line = a.map(String).join(' ');
      warns.push(line);
      // still visible in probe stdout as a count, not the full secret-bearing text if any
    };
    return () => { console.warn = real; };
  } };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  process.stdout.write(`probe-start base=${opts.baseUrl}\n`);
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    console.error('BLOCKED: TEST_EMAIL / TEST_PASSWORD missing in environment');
    process.exit(2);
  }

  const report = {
    observedAt: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    ruling: 'RULING-SOAK-CLASH-AND-GUARD-FIRING-20260728-2345',
    loginOk: false,
    sessionId: null,
    steps: [],
    verdict: null,
    productQuestion: 'Does durable journal write suppressed warn fire after live hydrate?',
  };

  process.stdout.write('probe-login…\n');
  const loginRes = await login(opts.baseUrl, email, password);
  report.loginOk = loginRes.ok;
  report.loginStatus = loginRes.status;
  process.stdout.write(`probe-login-done ok=${loginRes.ok} status=${loginRes.status}\n`);
  if (!loginRes.ok) {
    report.verdict = 'BLOCKED_AUTH';
    report.detail = String(loginRes.detail).slice(0, 200);
    writeReport(report);
    console.log(JSON.stringify({ verdict: report.verdict, detail: report.detail, outFile: report.outFile }, null, 2));
    process.exit(2);
  }
  const cookie = loginRes.cookie;

  process.stdout.write('probe-claim-window…\n');
  const claim = await claimChartWindow(opts.baseUrl, cookie);
  report.steps.push({
    step: 'claim-chart-window',
    status: claim.status,
    ok: claim.ok,
    evicted: claim.json?.evicted_client_ids?.length || 0,
  });
  if (!claim.ok) {
    report.verdict = 'BLOCKED_CHART_WINDOW';
    report.detail = JSON.stringify(claim.json).slice(0, 300);
    writeReport(report);
    console.log(JSON.stringify({ verdict: report.verdict, detail: report.detail, outFile: report.outFile }, null, 2));
    process.exit(2);
  }
  const chartWindowId = claim.clientId;
  process.stdout.write('probe-claim-ok\n');

  // Prefer a fresh session. If the account is at the 5-session backtest cap,
  // reclaim only prior probe-named empties, else reuse an empty personal session.
  // Never delete a session whose journal is non-empty.
  let sessionId = null;
  let created = false;
  process.stdout.write('probe-create-session…\n');
  const create = await api(opts.baseUrl, cookie, 'POST', '/api/sessions', {
    name: `B-GUARD-FIRE-${Date.now()}`,
    session_type: 'personal',
    config: { instrument: 'EURUSD', timeframe: '1m' },
  });
  process.stdout.write(`probe-create-done status=${create.status} ok=${create.ok}\n`);
  report.steps.push({ step: 'create-session', status: create.status, ok: create.ok });
  if (create.ok) {
    sessionId = create.json?.session?.id;
    created = true;
  } else {
    const list = await api(opts.baseUrl, cookie, 'GET', '/api/sessions');
    const sessions = Array.isArray(list.json?.sessions) ? list.json.sessions
      : (Array.isArray(list.json) ? list.json : []);
    report.steps.push({ step: 'list-sessions', status: list.status, count: sessions.length });

    const probeNamed = sessions.filter((s) => /^B-GUARD-FIRE-/i.test(String(s.name || '')));
    for (const s of probeNamed) {
      const st = await api(opts.baseUrl, cookie, 'GET', `/api/sessions/${s.id}/state`, undefined, { chartWindowId });
      const jLen = Array.isArray(st.json?.state?.journal) ? st.json.state.journal.length : -1;
      if (st.ok && jLen === 0) {
        const del = await api(opts.baseUrl, cookie, 'DELETE', `/api/sessions/${s.id}`);
        report.steps.push({ step: 'reclaim-probe-session', id: s.id, deleted: del.ok, jLen });
      } else {
        report.steps.push({
          step: 'skip-reclaim',
          id: s.id,
          jLen,
          stateStatus: st.status,
          detail: st.json?.detail?.code || null,
        });
      }
    }

    const retry = await api(opts.baseUrl, cookie, 'POST', '/api/sessions', {
      name: `B-GUARD-FIRE-${Date.now()}`,
      session_type: 'personal',
      config: { instrument: 'EURUSD', timeframe: '1m' },
    });
    report.steps.push({ step: 'create-session-retry', status: retry.status, ok: retry.ok });
    if (retry.ok) {
      sessionId = retry.json?.session?.id;
      created = true;
    } else {
      // Reuse an empty personal session (read-only toward others' data: we only append
      // one probe trade and record it; no session delete of foreign content).
      const list2 = await api(opts.baseUrl, cookie, 'GET', '/api/sessions');
      const sessions2 = Array.isArray(list2.json?.sessions) ? list2.json.sessions
        : (Array.isArray(list2.json) ? list2.json : []);
      for (const s of sessions2) {
        const st = await api(opts.baseUrl, cookie, 'GET', `/api/sessions/${s.id}/state`, undefined, { chartWindowId });
        const jLen = Array.isArray(st.json?.state?.journal) ? st.json.state.journal.length : -1;
        if (st.ok && jLen === 0) {
          sessionId = s.id;
          report.steps.push({ step: 'reuse-empty-session', id: s.id, name: String(s.name || '').slice(0, 40) });
          break;
        }
      }
    }
  }

  if (sessionId == null) {
    report.verdict = 'BLOCKED_SESSION_CREATE';
    report.detail = 'Could not create or reclaim an empty session under the 5-session cap without touching non-empty journals.';
    writeReport(report);
    console.log(JSON.stringify({ verdict: report.verdict, detail: report.detail, outFile: report.outFile, steps: report.steps }, null, 2));
    process.exit(2);
  }
  report.sessionId = sessionId;
  report.createdSession = created;
  process.stdout.write(`probe-session-id=${sessionId} created=${created}\n`);

  try {
    const stateGet = await api(
      opts.baseUrl, cookie, 'GET', `/api/sessions/${sessionId}/state`, undefined, { chartWindowId },
    );
    report.steps.push({
      step: 'get-state',
      status: stateGet.status,
      ok: stateGet.ok,
      journalLen: Array.isArray(stateGet.json?.state?.journal) ? stateGet.json.state.journal.length : null,
    });
    if (!stateGet.ok) {
      report.verdict = 'BLOCKED_STATE_GET';
      report.detail = JSON.stringify(stateGet.json).slice(0, 300);
      writeReport(report);
      console.log(JSON.stringify({ verdict: report.verdict, detail: report.detail, outFile: report.outFile, steps: report.steps }, null, 2));
      process.exit(2);
    }
    const serverJournal = Array.isArray(stateGet.json?.state?.journal)
      ? stateGet.json.state.journal
      : [];

    const OrderManager = loadOrderManager();
    const network = { durablePatches: [], pending: [] };

    // Control: unhydrated must suppress (proves probe sees the warn).
    {
      const { om, warns, captureWarn } = makeLiveOm(OrderManager, {
        sessionId: String(sessionId), baseUrl: opts.baseUrl, cookie, chartWindowId, network,
      });
      const restore = captureWarn();
      const res = await om.persistJournal();
      restore();
      report.steps.push({
        step: 'control-unhydrated',
        provenance: om._journalProvenance,
        result: res,
        warnCount: warns.length,
        warnMatched: warns.some((w) => /durable journal write suppressed/i.test(w)),
      });
    }

    // Product path: session-state-hydrate from live GET, then write one local row + persist.
    {
      const { om, warns, durablePatches, captureWarn } = makeLiveOm(OrderManager, {
        sessionId: String(sessionId), baseUrl: opts.baseUrl, cookie, chartWindowId, network,
      });
      om._m19CommitJournalArray(serverJournal, 'session-state-hydrate');
      const trade = {
        tradeId: `probe-${Date.now()}`,
        client_trade_id: `probe-${Date.now()}`,
        ticker: 'EURUSD',
        symbol: 'EURUSD',
        side: 'buy',
        openPrice: 1.1,
        closePrice: 1.1005,
        quantity: 1,
        pnl: 5,
        openTime: Date.now() - 60_000,
        closeTime: Date.now(),
      };
      if (typeof om._m19AppendJournalRecord === 'function') om._m19AppendJournalRecord(trade);
      else om.tradeJournal.push(trade);

      const restore = captureWarn();
      const res = await om.persistJournal();
      restore();
      if (network.pending.length) await Promise.all(network.pending);

      const warnMatched = warns.some((w) => /durable journal write suppressed/i.test(w));
      report.steps.push({
        step: 'live-hydrate-then-persist',
        provenance: om._journalProvenance,
        provenanceSession: om._journalProvenanceSession,
        journalLen: Array.isArray(om.tradeJournal) ? om.tradeJournal.length : null,
        result: res,
        warnCount: warns.length,
        warnMatched,
        durablePatchCount: durablePatches.length,
        networkDurable: network.durablePatches.slice(-3),
      });

      // Confirm server accepted a durable write when not suppressed.
      const after = await api(
        opts.baseUrl, cookie, 'GET', `/api/sessions/${sessionId}/state`, undefined, { chartWindowId },
      );
      const afterLen = Array.isArray(after.json?.state?.journal) ? after.json.state.journal.length : null;
      report.steps.push({
        step: 'post-write-state',
        status: after.status,
        ok: after.ok,
        journalLen: afterLen,
      });

      if (warnMatched) {
        report.verdict = 'WARN_FIRED_ON_LIVE_HYDRATE';
        report.detail = 'Guard suppressed a durable write after session-state-hydrate against the live backend. Hotfix may be blocking legitimate saves.';
      } else if (res && res.durableQueued === false && res.reason === 'journal-unhydrated') {
        report.verdict = 'SUPPRESSED_WITHOUT_WARN_TEXT';
        report.detail = 'durableQueued false with journal-unhydrated after hydrate — unexpected';
      } else if (res && res.durableQueued === true && !warnMatched) {
        report.verdict = 'HARNESS_ARTEFACT';
        report.detail = 'After live hydrate, durable write proceeded and suppress warn did not appear. Soak ×50 is a harness artefact.';
      } else {
        report.verdict = 'UNDETERMINED';
        report.detail = JSON.stringify({ res, warnMatched, afterLen });
      }
    }
  } finally {
    // Best-effort cleanup only for sessions this probe created.
    if (sessionId != null && created) {
      const del = await api(opts.baseUrl, cookie, 'DELETE', `/api/sessions/${sessionId}`);
      report.steps.push({ step: 'delete-session', status: del.status, ok: del.ok });
    }
  }

  writeReport(report);
  const exit = report.verdict === 'HARNESS_ARTEFACT' ? 0
    : report.verdict === 'WARN_FIRED_ON_LIVE_HYDRATE' ? 3
    : 2;
  console.log(JSON.stringify({
    verdict: report.verdict,
    detail: report.detail,
    sessionId: report.sessionId,
    steps: report.steps,
    outFile: report.outFile,
  }, null, 2));
  process.exit(exit);
}

function writeReport(report) {
  const outDir = path.join(HERE, 'observations');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `live-hydration-guard-firing-${report.observedAt.replace(/[:.]/g, '-')}.json`,
  );
  report.outFile = outFile;
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || e);
    process.exit(1);
  });
}
