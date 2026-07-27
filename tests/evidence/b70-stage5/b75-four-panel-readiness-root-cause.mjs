#!/usr/bin/env node
/**
 * Authenticated B75 four-panel readiness root-cause probe.
 * Diagnostic only: customer/product mutations never reach the server.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { configuredSessionAssignments } from './mc-restore-session-fixture.mjs';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
const requested = String(process.env.B75_QA_SESSION_ID || 'QA 123');
const timeoutMs = Math.max(30_000, Number(process.env.B75_READINESS_TIMEOUT_MS || 120_000));
const output = path.resolve(process.env.B75_READINESS_EVIDENCE
  || path.join(os.tmpdir(), `b75-four-panel-readiness-${Date.now()}.json`));
if (!origin || !email || !password) throw new Error('TEST_VPS_URL/TEST_EMAIL/TEST_PASSWORD required');

const originUrl = new URL(origin);
const operational = new Set([
  'POST /api/auth/login',
  'POST /api/chart/windows/claim',
  'POST /api/chart/windows/heartbeat',
  'POST /api/chart/windows/release',
]);
const evidence = {
  schema: 'talaria-b75-four-panel-readiness-root-cause-v1',
  generatedAt: new Date().toISOString(),
  sourceContracts: ['a4d507296', 'ef86083e5'],
  requestedSessionAlias: 'QA 123',
  mutationPolicy: {
    mode: 'default-block',
    operationalAllowed: [...operational],
    productDataMutationsAllowed: false,
    legacyHarnessPredicate: 'manager.charts.size === 4 && every(entry.ready)',
    productTopologyPredicate: 'host chart loaded plus manager.charts.size === 3 and every peer entry.ready',
  },
  ownerScope: null,
  arms: [],
  verdict: 'INCONCLUSIVE',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bounded = (promise, ms, fallback) => Promise.race([
  promise,
  sleep(ms).then(() => fallback),
]);
const aliasPanel = (value, fallback) => {
  const text = String(value || fallback || '');
  const match = text.match(/[A-D]$/i);
  return match ? `panel-${match[0].toUpperCase()}` : `panel-${fallback}`;
};

async function installProbe(page, arm) {
  await page.evaluateOnNewDocument(() => {
    const probe = window.__b75ReadinessProbe = {
      bornAt: Date.now(), events: [], chartDataLoaded: 0, errors: [],
      storage: {}, serviceWorker: null,
    };
    const push = (type, detail = {}) => {
      probe.events.push({ at: Date.now(), type, ...detail });
      if (probe.events.length > 2000) probe.events.shift();
    };
    addEventListener('chartDataLoaded', (event) => {
      probe.chartDataLoaded++;
      push('chartDataLoaded', {
        bars: window.chart?.data?.length ?? null,
        rawBars: window.chart?.rawData?.length ?? null,
        file: window.chart?.currentFileId ? 'assigned-file' : null,
        detailKeys: event?.detail ? Object.keys(event.detail).slice(0, 20) : [],
      });
    });
    addEventListener('error', (event) => {
      probe.errors.push(String(event?.message || 'window error').slice(0, 400));
    });
    addEventListener('unhandledrejection', (event) => {
      probe.errors.push(String(event?.reason?.message || event?.reason || 'unhandled rejection').slice(0, 400));
    });
    addEventListener('message', (event) => {
      const message = event.data;
      if (message && typeof message === 'object' && /ready|panel|replay|lease|host-log/i.test(String(message.type || ''))) {
        push('message-received', {
          messageType: String(message.type || ''), source: String(message.source || ''),
          originMatches: event.origin === location.origin,
        });
      }
    }, true);
    const nativePost = window.postMessage;
    window.postMessage = function observedPost(message, ...rest) {
      if (message && typeof message === 'object' && /ready|panel|replay|lease/i.test(String(message.type || ''))) {
        push('window-postMessage', { messageType: String(message.type || ''), source: String(message.source || '') });
      }
      return nativePost.call(this, message, ...rest);
    };
    addEventListener('DOMContentLoaded', () => {
      try {
        probe.storage = {
          panelStatePresent: !!localStorage.getItem('chart_panel_state'),
          activeSessionPresent: !!localStorage.getItem('active_trading_session_id'),
          windowIdPresent: !!sessionStorage.getItem('talaria_chart_window_id'),
        };
      } catch (error) {
        probe.storage = { error: String(error?.message || error) };
      }
      probe.serviceWorker = {
        controlled: !!navigator.serviceWorker?.controller,
        controllerUrl: navigator.serviceWorker?.controller?.scriptURL || null,
      };
      push('dom-content-loaded', {
        path: location.pathname,
        queryKeys: [...new URLSearchParams(location.search).keys()].sort(),
      });
    });
  });

  page.on('frameattached', (frame) => arm.timeline.push({
    at: Date.now(), type: 'frame-attached', frame: frame === page.mainFrame() ? 'main' : 'panel',
  }));
  page.on('framenavigated', (frame) => arm.timeline.push({
    at: Date.now(), type: 'frame-navigated', frame: frame === page.mainFrame() ? 'main' : 'panel',
    path: (() => { try { return new URL(frame.url()).pathname; } catch { return 'invalid'; } })(),
  }));
  page.on('pageerror', (error) => arm.pageErrors.push(String(error?.message || error).slice(0, 500)));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      arm.console.push({ type: message.type(), text: message.text().replaceAll(email, '[redacted]').slice(0, 500) });
    }
  });
  page.on('response', (response) => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (url.origin !== originUrl.origin) return;
    const type = response.request().resourceType();
    if (type === 'document' || url.pathname.startsWith('/api/')) {
      const sanitizedPath = url.pathname
        .replace(/\/api\/sessions\/[^/]+/g, '/api/sessions/{owner-session}')
        .replace(/\/api\/file\/[^/]+/g, '/api/file/{owner-file}');
      arm.network.push({
        at: Date.now(), method: response.request().method(), path: sanitizedPath,
        status: response.status(), resourceType: type,
      });
    }
  });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    let url;
    try { url = new URL(request.url()); } catch { return request.continue().catch(() => {}); }
    const method = request.method().toUpperCase();
    const key = `${method} ${url.pathname}`;
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!mutating || url.origin !== originUrl.origin || operational.has(key)) {
      return request.continue().catch(() => {});
    }
    let bodyKeys = [];
    try { bodyKeys = Object.keys(JSON.parse(request.postData() || '{}')).sort(); } catch {}
    arm.interceptedMutations.push({
      at: Date.now(), method, pathClass: url.pathname.includes('/state')
        ? '/api/sessions/{owner-session}/state' : url.pathname,
      bodyKeys, disposition: 'synthetic-success-no-server-write',
      operationalLease: /chart\/windows/.test(url.pathname),
    });
    return request.respond({
      status: 200, contentType: 'application/json',
      body: '{"success":true,"diagnosticIntercepted":true}',
    }).catch(() => {});
  });
}

async function discover(page) {
  await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  return page.evaluate(async ({ e, p, wanted }) => {
    const request = async (url, init) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...init });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const login = await request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
    const [me, sessions, files] = await Promise.all([
      request('/api/auth/me'), request('/api/sessions'), request('/api/files?session_ready=1'),
    ]);
    const rows = sessions.body?.sessions || [];
    const exact = rows.find((row) => String(row.id) === wanted
      || String(row.name ?? row.session_name ?? row.title ?? '').trim() === wanted);
    if (login.status !== 200 || me.status !== 200 || !exact) {
      return { error: `discovery failed login=${login.status} me=${me.status} exact=${!!exact}` };
    }
    const detail = await request(`/api/sessions/${encodeURIComponent(exact.id)}`);
    return {
      statuses: [login.status, me.status, sessions.status, files.status, detail.status],
      session: detail.body?.session, sessionId: String(exact.id),
      files: Array.isArray(files.body) ? files.body : (files.body?.files || files.body?.data || []),
    };
  }, { e: email, p: password, wanted: requested });
}

async function poll(page, arm, started) {
  const snapshot = await bounded(page.evaluate(() => {
    const manager = window.__multichartManagerRef || window.__mcManager;
    const entries = manager?.charts ? [...manager.charts.values()] : [];
    const describe = (entry, index) => {
      const win = entry?.host ? window : entry?.frame?.contentWindow;
      const chart = win?.chart;
      const probe = win?.__b75ReadinessProbe;
      let framePath = null;
      try { framePath = entry?.frame ? new URL(entry.frame.src).pathname : location.pathname; } catch {}
      return {
        panel: String.fromCharCode(65 + index), host: !!entry?.host, ready: !!entry?.ready,
        entryId: entry?.id ?? null, cfgId: entry?.cfg?.id ?? null,
        restoreGeneration: entry?._mcRestoreGeneration ?? null,
        urlPanelId: (() => {
          try { return new URL(entry?.frame?.src || location.href).searchParams.get('panelId'); } catch { return null; }
        })(),
        frameConnected: entry?.frame?.isConnected ?? null,
        frameLoadCount: entry?._frameLoadCount ?? null, framePath,
        documentState: win?.document?.readyState ?? null,
        chartPresent: !!chart, syncBridgePresent: !!win?.__MULTICHART_SYNC_BRIDGE_VERSION,
        panelCmdBridgePresent: !!win?.MultichartCmdBridge,
        chartDataLoaded: probe?.chartDataLoaded ?? null,
        bars: chart?.data?.length ?? null, rawBars: chart?.rawData?.length ?? null,
        replayBars: chart?.replaySystem?.fullRawData?.length ?? null,
        fileAssigned: !!(chart?.currentFileId ?? entry?.cfg?.fileId),
        managerError: entry?.error ?? entry?.bootError ?? null,
        probeErrors: probe?.errors ?? [],
        storage: probe?.storage ?? null, serviceWorker: probe?.serviceWorker ?? null,
        probeEvents: probe?.events?.slice(-20) ?? [],
      };
    };
    return {
      managerPresent: !!manager, managerSize: entries.length,
      restoreGeneration: manager?._mcRestoreGeneration ?? null,
      restoreCompletedGeneration: manager?._mcRestoreCompletedGeneration ?? null,
      panels: entries.map(describe),
      mainProbe: window.__b75ReadinessProbe || null,
      cookiesPresent: document.cookie.length > 0,
    };
  }).catch((error) => ({ evaluateError: String(error?.message || error) })),
  3000, { evaluateError: 'main-thread-unresponsive-after-3000ms' });
  snapshot.atMs = Date.now() - started;
  snapshot.panels?.forEach((panel) => { panel.panel = aliasPanel(panel.panel, panel.panel); });
  arm.snapshots.push(snapshot);
  return snapshot.managerSize === 4 && snapshot.panels?.every((panel) => panel.ready);
}

async function runArm(browser, kind, selected) {
  const arm = {
    kind, startedAt: new Date().toISOString(), timeline: [], network: [],
    interceptedMutations: [], pageErrors: [], console: [], snapshots: [],
    readinessReached: false,
  };
  evidence.arms.push(arm);
  process.stdout.write(`[b75-readiness] starting ${kind}\n`);
  const page = await browser.newPage();
  await installProbe(page, arm);
  const windowId = randomUUID();
  try {
    await page.goto(`${origin}/login/`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const state = {
      layout: '4', selectedPanelIndex: 0, sessionId: selected.sessionId,
      panels: selected.assignments.map((row, index) => ({
        index, isMainChart: index === 0, timeframe: '1m',
        fileId: row.fileId, symbol: row.ticker, ticker: row.ticker,
      })),
    };
    if (kind === 'manual-equivalent') {
      await page.evaluate(({ sid, id }) => {
        sessionStorage.setItem('talaria_chart_window_id', id);
        localStorage.setItem('active_trading_session_id', sid);
      }, { sid: selected.sessionId, id: windowId });
      await page.goto(`${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=1&sessionId=${encodeURIComponent(selected.sessionId)}`,
        { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await sleep(3000);
    }
    await page.evaluate(({ sid, id, panelState }) => {
      sessionStorage.setItem('talaria_chart_window_id', id);
      localStorage.setItem('active_trading_session_id', sid);
      localStorage.setItem('chart_panel_state', JSON.stringify(panelState));
    }, { sid: selected.sessionId, id: windowId, panelState: state });
    const target = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=4&sessionId=${encodeURIComponent(selected.sessionId)}`;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const started = Date.now();
    let handshakeControlSent = false;
    while (Date.now() - started < timeoutMs) {
      await poll(page, arm, started);
      const latest = arm.snapshots.at(-1);
      const productFourPanelReady = latest?.managerSize === 3
        && latest.panels?.every((panel) => panel.ready)
        && latest.panels?.every((panel) => panel.chartDataLoaded > 0 && panel.bars > 0)
        && latest.mainProbe?.chartDataLoaded > 0;
      if (productFourPanelReady && !handshakeControlSent) {
        arm.readinessReached = true;
        arm.readinessAtMs = Date.now() - started;
        break;
      }
      if (!handshakeControlSent && Date.now() - started >= 10_000
          && latest?.managerSize === 3
          && latest.panels?.every((panel) => panel.syncBridgePresent && !panel.ready)) {
        arm.handshakeControl = await bounded(page.evaluate(() => {
          const manager = window.__multichartManagerRef || window.__mcManager;
          const before = [...manager.charts.values()].map((entry) => ({ id: entry.id, ready: entry.ready }));
          for (const entry of manager.charts.values()) {
            window.dispatchEvent(new MessageEvent('message', {
              data: { type: 'bridge-ready', source: entry.id, api: {} },
              origin: location.origin,
              source: entry.frame.contentWindow,
            }));
          }
          return {
            before,
            after: [...manager.charts.values()].map((entry) => ({ id: entry.id, ready: entry.ready })),
            managerGeneration: manager._mcRestoreGeneration ?? null,
            entryGenerations: [...manager.charts.values()].map((entry) => entry._mcRestoreGeneration ?? null),
          };
        }), 3000, { error: 'handshake-control-main-thread-timeout' });
        handshakeControlSent = true;
        arm.causalControlReached = arm.handshakeControl?.after?.length === 3
          && arm.handshakeControl.after.every((entry) => entry.ready);
        break;
      }
      await sleep(1000);
    }
    process.stdout.write(`[b75-readiness] ${kind} ready=${arm.readinessReached} snapshots=${arm.snapshots.length}\n`);
    arm.final = arm.snapshots.at(-1);
    arm.failureStage = arm.readinessReached ? null : arm.final?.panels?.map((panel) => ({
      panel: panel.panel, ready: panel.ready, documentState: panel.documentState,
      chartPresent: panel.chartPresent, syncBridgePresent: panel.syncBridgePresent,
      chartDataLoaded: panel.chartDataLoaded, bars: panel.bars, rawBars: panel.rawBars,
      probeErrors: panel.probeErrors,
    }));
    arm.operationalLeaseIntercepted = arm.interceptedMutations.some((row) => row.operationalLease);
  } catch (error) {
    arm.blocker = String(error?.message || error).replaceAll(selected.sessionId, '[owner-session]');
  } finally {
    await bounded(page.close().catch(() => {}), 5000, null);
  }
  return arm;
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-b75-readiness-'));
const browser = await puppeteer.launch({
  headless: 'new', userDataDir: profileDir,
  args: ['--no-sandbox', '--disable-extensions', '--no-first-run'],
});
try {
  const discoveryPage = await browser.newPage();
  const found = await discover(discoveryPage);
  await discoveryPage.close();
  if (found.error) throw new Error(found.error);
  const assignments = configuredSessionAssignments(found.session, found.files, 4);
  if (new Set(assignments.map((row) => String(row.fileId))).size !== 4) {
    throw new Error('QA 123 does not resolve to four distinct ready files');
  }
  const selected = { sessionId: found.sessionId, assignments };
  evidence.ownerScope = {
    authenticated: true, exactQa123: true, statusAll200: found.statuses.every((status) => status === 200),
    files: assignments.map((_row, index) => `file-${String.fromCharCode(65 + index)}`),
  };
  await runArm(browser, 'manual-equivalent', selected);
  await runArm(browser, 'direct-persisted-layout', selected);
  const organicPass = evidence.arms.filter((arm) => arm.readinessReached);
  const causalPass = evidence.arms.filter((arm) => arm.causalControlReached);
  evidence.verdict = organicPass.length === evidence.arms.length ? 'NOT_REPRODUCED'
    : causalPass.length === evidence.arms.length ? 'PRODUCT_BRIDGE_READINESS_DEFECT'
      : organicPass.length === 1 ? 'HARNESS_ONLY' : 'SHARED_READINESS_FAILURE';
  evidence.causalConclusion = {
    operationalLeaseRequiredButIntercepted: evidence.arms.some((arm) => arm.operationalLeaseIntercepted),
    productMutationsReachedServer: false,
    readinessWeakened: false,
    legacyFourEntryPredicateStructurallyImpossible: evidence.arms.every((arm) =>
      arm.final?.managerSize === 3 && arm.final?.panels?.every((panel) => !panel.host)),
    duplicateAuthenticatedHandshakeMakesAllPeersReady: causalPass.length === evidence.arms.length,
  };
} catch (error) {
  evidence.blocker = String(error?.message || error);
} finally {
  await bounded(browser.close().catch(() => {}), 5000, null);
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ verdict: evidence.verdict, blocker: evidence.blocker || null, output }, null, 2)}\n`);
  process.exitCode = evidence.verdict === 'INCONCLUSIVE' ? 2 : 0;
}
