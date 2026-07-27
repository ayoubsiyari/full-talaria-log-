import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.env.DIAG_REPO);
const out = path.resolve(process.env.DIAG_OUT);
const port = Number(process.env.DIAG_PORT);
const harness = path.join(repo, 'chart v 1.4/chart/multichart-prod/harness');
process.env.REACT_PARITY_HARNESS_PORT = String(port);

const lib = await import(pathToFileURL(path.join(harness, 'react-parity-lib.mjs')));
const scenarios = await import(pathToFileURL(path.join(harness, 'react-parity-scenarios.mjs')));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const events = [];
const pages = [];
const startedAt = new Date().toISOString();
const server = spawn(process.execPath, [path.join(harness, 'serve.mjs')], {
  cwd: harness,
  env: { ...process.env, PORT: String(port) },
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });
const deadline = Date.now() + 30_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    if (response.status < 500) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 200));
}
if (!ready) throw new Error(`diagnostic server failed on ${port}: ${serverOutput}`);
const stack = {
  harnessPort: port,
  url: lib.builtReactParityUrl(port),
  surface: 'built-dist-v9',
  buildId: lib.currentReactBuildId(),
  close: async () => {},
};
const browser = await lib.launchBrowser({ headful: false });
const originalNewPage = browser.newPage.bind(browser);

browser.newPage = async () => {
  const page = await originalNewPage();
  pages.push(page);
  await page.evaluateOnNewDocument(() => {
    window.__H_A8_DIAG_RAF = 0;
    const tick = () => {
      window.__H_A8_DIAG_RAF += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const sample = async (type, args) => {
    const state = await page.evaluate(() => ({
      raf: window.__H_A8_DIAG_RAF || 0,
      focus: document.hasFocus(),
      activeElement: document.activeElement?.tagName || null,
      dpr: window.devicePixelRatio,
      visibility: document.visibilityState,
      now: performance.now(),
    })).catch(() => null);
    const panelB = lib.panelFrameMap(page).B;
    const geometry = panelB ? await panelB.evaluate(() => {
      const drawing = window.chart?.drawingManager?.drawings
        ?.find((item) => item?.type === 'anchored-volume-profile');
      const point = drawing?.points?.[0];
      return point ? { barIndex: Number(point.x), price: Number(point.y) } : null;
    }).catch(() => null) : null;
    const coordinates = await lib.readAvVpCoordTabFields(page).catch(() => null);
    events.push({
      seq: events.length + 1,
      type,
      args,
      state,
      geometry,
      coordinates,
      hostNs: process.hrtime.bigint().toString(),
    });
  };
  for (const method of ['move', 'down', 'up']) {
    const original = page.mouse[method].bind(page.mouse);
    page.mouse[method] = async (...args) => {
      await sample(`mouse.${method}.before`, args);
      const result = await original(...args);
      await sample(`mouse.${method}.after`, args);
      return result;
    };
  }
  return page;
};

let result;
let error = null;
try {
  const scenario = scenarios.reactScenarioList().find((item) => item.id === 'H-A8-VP-2');
  result = await scenario.run({
    browser,
    stack,
    migrationOn: false,
    phase1Off: false,
    phase5Off: false,
    panelKeyboardOff: false,
    peerDeselectOff: false,
    iframeCtrlDedupeOff: false,
    lifecycleOff: false,
    legacySelectionOff: false,
    hr02ActuationMiss: false,
    chromeDomReadyOff: false,
    panelBSettingsTransportOff: false,
    panelBSettingsTransportAOff: false,
    orderMcStateConvergeOff: false,
    v9QuickbarLiveResolveOff: false,
    vpV9AvLabelBridgeOff: false,
    vpV9AvCoordRepositionOff: false,
  });
} catch (caught) {
  error = String(caught?.stack || caught);
} finally {
  const browserVersion = await browser.version().catch(() => null);
  const userAgent = await browser.userAgent().catch(() => null);
  const checks = result?.checks?.items || [];
  const failures = checks.filter((item) => !item.ok);
  const failureSignature = failures.map((item) => `[FAIL] ${item.label} — ${item.detail}`).join('\n');
  const sourceBytes = fs.readFileSync(path.join(harness, 'react-parity-scenarios.mjs'));
  const helperBytes = fs.readFileSync(path.join(harness, 'react-parity-lib.mjs'));
  const sourceText = sourceBytes.toString();
  const functionText = sourceText.match(/async function hA8Vp2\(ctx\) \{.*?\n\}/s)?.[0] || '';
  const assertionText = sourceText.split(/\r?\n/).slice(976, 985).join('\n');
  const artifact = {
    schema: 'talaria.h-a8-vp-2-repeat-run/v1',
    repo,
    requestedCommit: process.env.DIAG_COMMIT,
    run: Number(process.env.DIAG_RUN),
    port,
    startedAt,
    endedAt: new Date().toISOString(),
    browserVersion,
    userAgent,
    launch: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      defaultViewport: { width: 1280, height: 900 },
      scenarioViewport: { width: 1440, height: 960 },
      pinnedDeviceScaleFactor: 1,
    },
    source: {
      scenarioSha256: hash(sourceBytes),
      helperSha256: hash(helperBytes),
      functionSha256: hash(functionText.replace(/\r\n/g, '\n')),
      assertionSha256: hash(assertionText),
      assertionText,
    },
    checks,
    failures,
    failureSignature,
    failureSignatureSha256: hash(failureSignature),
    normalizedFailureSignatureSha256: hash(failureSignature.trim()),
    events,
    error,
    serverOutput,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
  await browser.close().catch(() => {});
  server.kill();
}

if (error) process.exit(2);
if (result?.checks?.passed) process.exit(0);
process.exit(1);
