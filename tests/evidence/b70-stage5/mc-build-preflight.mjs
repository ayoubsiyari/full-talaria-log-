import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const MARKER = '__TALARIA_IDENTITY_V1__';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/auth|cookie|key|secret|session|token/i.test(key)) url.searchParams.set(key, '<redacted>');
    }
    return url.href;
  } catch { return '<invalid-url>'; }
};

export function normalizeExpectedBuild(value) {
  const result = String(value ?? '').replace(/^\uFEFF/, '').trim();
  if (!/^\d{8}b\d+$/.test(result)) throw new Error('expected build ID is invalid');
  return result;
}

export function classifyProtocolError(error, browserConnected = true, pageClosed = false) {
  const message = String(error?.message || error);
  if (!browserConnected || /browser has disconnected|Connection closed/i.test(message)) return 'browser-close';
  if (pageClosed || /Target closed|Session closed/i.test(message)) return 'target-close';
  if (/Execution context was destroyed|Cannot find context|detached Frame|navigation/i.test(message)) {
    return 'navigation-context-destroyed';
  }
  return 'evaluation-error';
}

export function createLifecycleState(expectedBuild, now = Date.now) {
  return {
    expectedBuild,
    startedAt: now(),
    stage: 'launch',
    currentUrl: null,
    statuses: [],
    redirects: [],
    frames: new Map(),
    hostBuildId: null,
    browserClosed: false,
    pageClosed: false,
    processExit: null,
    events: [],
  };
}

function record(state, type, data = {}, now = Date.now) {
  state.events.push({ atMs: now() - state.startedAt, type, ...data });
  if (state.events.length > 80) state.events.splice(0, state.events.length - 80);
}

export function acceptMarker(state, text) {
  if (!text.startsWith(MARKER)) return false;
  let row;
  try { row = JSON.parse(text.slice(MARKER.length)); } catch { return false; }
  if (typeof row.buildId !== 'string' || !row.buildId) return false;
  const url = safeUrl(row.url);
  if (row.top) state.hostBuildId = row.buildId;
  else {
    const frame = state.frames.get(url) || { url, ready: false, buildId: null };
    frame.buildId = row.buildId;
    frame.ready = true;
    state.frames.set(url, frame);
  }
  record(state, row.top ? 'host-build' : 'frame-build', { url, buildId: row.buildId });
  return true;
}

export function identityVerdict(state) {
  const chartFrames = [...state.frames.values()].filter((row) => /chart-embed\.html/.test(row.url));
  const failures = [];
  if (!state.hostBuildId) failures.push('empty top-level build ID');
  else if (state.hostBuildId !== state.expectedBuild) failures.push(`top-level build mismatch: ${state.hostBuildId}`);
  if (!chartFrames.length) failures.push('no chart iframe observed');
  for (const frame of chartFrames) {
    if (!frame.buildId) failures.push(`empty iframe build ID: ${frame.url}`);
    else if (frame.buildId !== state.expectedBuild) failures.push(`iframe build mismatch: ${frame.buildId}`);
  }
  return { ok: failures.length === 0, failures, chartFrames };
}

export async function waitStage(state, stage, predicate, timeoutMs, options = {}) {
  state.stage = stage;
  const deadline = (options.now || Date.now)() + timeoutMs;
  while ((options.now || Date.now)() < deadline) {
    if (state.browserClosed) throw Object.assign(new Error(`browser closed during ${stage}`), { kind: 'browser-close' });
    if (state.pageClosed) throw Object.assign(new Error(`target closed during ${stage}`), { kind: 'target-close' });
    const value = predicate();
    if (value) return value;
    await (options.sleep || sleep)(options.intervalMs ?? 25);
  }
  throw Object.assign(new Error(`${stage} exceeded ${timeoutMs}ms`), { kind: 'internal-timeout' });
}

export function diagnostics(state, error) {
  const verdict = identityVerdict(state);
  return {
    ok: false,
    errorClass: error?.kind || classifyProtocolError(error, !state.browserClosed, state.pageClosed),
    message: String(error?.message || error).replace(/(authorization|cookie|password|token)=[^&\s]+/ig, '$1=<redacted>'),
    lastStage: state.stage,
    currentUrl: safeUrl(state.currentUrl),
    frameUrls: [...state.frames.keys()].slice(0, 20).map(safeUrl),
    httpStatusClasses: [...new Set(state.statuses.map((value) => `${Math.floor(value / 100)}xx`))],
    redirects: state.redirects.slice(-12).map(safeUrl),
    processExit: state.processExit,
    browserClosed: state.browserClosed,
    pageClosed: state.pageClosed,
    hostBuildId: state.hostBuildId,
    frameBuildIds: verdict.chartFrames.map((row) => row.buildId),
    events: state.events,
  };
}

const preload = (marker) => {
  let value;
  try {
    Object.defineProperty(window, '__TALARIA_CHART_BUILD_ID', {
      configurable: true,
      get: () => value,
      set: (next) => {
        value = next;
        console.debug(marker + JSON.stringify({
          buildId: typeof next === 'string' ? next : '',
          url: location.href,
          top: window === window.top,
        }));
      },
    });
  } catch {}
};

export async function runIdentityProbe({ puppeteer, origin, expectedBuild, auth, budgets = {} }) {
  const state = createLifecycleState(expectedBuild);
  const browser = await puppeteer.launch({
    headless: 'new',
    dumpio: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const child = browser.process();
  child?.once('exit', (code, signal) => { state.processExit = { code, signal }; });
  browser.once('disconnected', () => { state.browserClosed = true; record(state, 'browser-disconnected'); });
  let page;
  let operationDone = false;
  try {
    page = await browser.newPage();
    page.once('close', () => { state.pageClosed = true; record(state, 'page-close'); });
    page.on('framenavigated', (frame) => {
      const url = safeUrl(frame.url());
      if (frame === page.mainFrame()) state.currentUrl = url;
      else state.frames.set(url, { url, ready: false, buildId: state.frames.get(url)?.buildId || null });
      record(state, 'frame-navigated', { url });
    });
    page.on('framedetached', (frame) => record(state, 'frame-detached', { url: safeUrl(frame.url()) }));
    page.on('response', (response) => {
      state.statuses.push(response.status());
      if (response.request().redirectChain().length) state.redirects.push(response.url());
      if (response.status() >= 400) {
        record(state, 'http-error', { status: response.status(), url: safeUrl(response.url()) });
      }
    });
    page.on('console', (message) => {
      if (!acceptMarker(state, message.text()) && message.type() === 'error') {
        record(state, 'console-error', { text: message.text().slice(0, 300) });
      }
    });
    page.on('pageerror', (error) => record(state, 'page-error', {
      text: String(error?.message || error).slice(0, 300),
    }));
    page.on('frameattached', (frame) => record(state, 'frame-attached', { url: safeUrl(frame.url()) }));
    await page.evaluateOnNewDocument(preload, MARKER);
    state.stage = 'login-navigation';
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: budgets.navigation ?? 20_000 });
    state.currentUrl = page.url();
    state.stage = 'login';
    const login = await page.evaluate(async ({ email, password }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      return { ok: response.ok, status: response.status };
    }, { email: auth.TEST_EMAIL, password: auth.TEST_PASSWORD });
    if (!login.ok) throw new Error(`authentication failed with HTTP ${login.status}`);
    state.stage = 'product-navigation';
    const sessionId = encodeURIComponent(process.env.B70_SESSION_ID || '827');
    const target = `${origin}/chart/dist-v9/index.html?mode=backtest&mcLayout=2&sessionId=${sessionId}`;
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: budgets.navigation ?? 20_000 });
    if (response) state.statuses.push(response.status());
    await waitStage(state, 'stable-main-target', () => !page.isClosed() && page.url().includes('/chart/dist-v9/'),
      budgets.stable ?? 5_000);
    await waitStage(state, 'top-level-build-id', () => state.hostBuildId, budgets.host ?? 15_000);
    await waitStage(state, 'iframe-discovery', () =>
      [...state.frames.values()].some((row) => /chart-embed\.html/.test(row.url)), budgets.iframe ?? 15_000);
    await waitStage(state, 'iframe-ready-build-ids', () => {
      const rows = [...state.frames.values()].filter((row) => /chart-embed\.html/.test(row.url));
      return rows.length > 0 && rows.every((row) => row.ready && row.buildId);
    }, budgets.frameBuild ?? 15_000);
    const verdict = identityVerdict(state);
    operationDone = true;
    return {
      ok: verdict.ok,
      expectedBuild,
      hostBuildId: state.hostBuildId,
      frames: verdict.chartFrames,
      currentUrl: safeUrl(state.currentUrl),
      httpStatusClasses: [...new Set(state.statuses.map((value) => `${Math.floor(value / 100)}xx`))],
      events: state.events,
      failures: verdict.failures,
    };
  } catch (error) {
    operationDone = true;
    return diagnostics(state, error);
  } finally {
    state.stage = 'cleanup';
    if (operationDone && page && !page.isClosed()) {
      await Promise.race([page.close().catch(() => {}), sleep(budgets.cleanup ?? 2_000)]);
    }
    if (browser.connected) {
      await Promise.race([browser.close().catch(() => {}), sleep(budgets.cleanup ?? 2_000)]);
    }
  }
}

async function main() {
  const expectedBuild = normalizeExpectedBuild(process.env.MC_EXPECTED_BUILD);
  const origin = String(process.env.TEST_VPS_URL || '').replace(/\/$/, '');
  if (!origin) throw new Error('TEST_VPS_URL is required');
  const auth = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  const require = createRequire(process.env.PUPPETEER_PACKAGE
    || '/opt/talaria-tooling-c7260f6f83b6/chart v 1.4/chart/multichart-prod/harness/package.json');
  const result = await runIdentityProbe({ puppeteer: require('puppeteer'), origin, expectedBuild, auth });
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (process.env.MC_IDENTITY_OUTPUT) fs.writeFileSync(process.env.MC_IDENTITY_OUTPUT, text, { mode: 0o600 });
  console.log(text);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
