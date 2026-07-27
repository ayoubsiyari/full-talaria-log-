import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const productRepo = path.resolve(process.env.DIAG_PRODUCT_REPO);
const harnessRepo = path.resolve(process.env.DIAG_HARNESS_REPO);
const out = path.resolve(process.env.DIAG_OUT);
const port = Number(process.env.DIAG_PORT);
const productHarness = path.join(productRepo, 'chart v 1.4/chart/multichart-prod/harness');
const correctedHarness = path.join(harnessRepo, 'chart v 1.4/chart/multichart-prod/harness');
const fixedNowMs = 1785150000000;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

process.env.REACT_PARITY_HARNESS_PORT = String(port);
const lib = await import(pathToFileURL(path.join(correctedHarness, 'react-parity-lib.mjs')));
const scenarios = await import(pathToFileURL(path.join(correctedHarness, 'react-parity-scenarios.mjs')));
const server = spawn(process.execPath, [path.join(correctedHarness, 'serve.mjs')], {
  cwd: correctedHarness,
  env: {
    ...process.env,
    PORT: String(port),
    TALARIA_HARNESS_FIXED_NOW_MS: String(fixedNowMs),
    TALARIA_HARNESS_CHART_ROOT: path.join(productRepo, 'chart v 1.4/chart'),
  },
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
if (!ready) throw new Error(`server failed on ${port}: ${serverOutput}`);

const stack = {
  harnessPort: port,
  url: `http://127.0.0.1:${port}/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`,
  surface: 'built-dist-v9',
  buildId: process.env.DIAG_BUILD_ID,
  close: async () => {},
};
const browser = await lib.launchBrowser({ headful: false });
const browserVersion = await browser.version();
const userAgent = await browser.userAgent();
const logs = [];
const originalLog = console.log;
console.log = (...args) => {
  logs.push(args.map(String).join(' '));
};
let result;
let error = null;
const startedAt = new Date().toISOString();
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
  console.log = originalLog;
  await browser.close().catch(() => {});
  server.kill();
}

const signatureLine = logs.find((line) => line.startsWith('H-A8-VP-2 SEMANTIC-SIGNATURE '));
const match = signatureLine?.match(/^H-A8-VP-2 SEMANTIC-SIGNATURE ([0-9a-f]{64}) (.+)$/);
if (!match) error ||= 'semantic signature line missing';
const checks = result?.checks?.items || [];
const artifact = {
  schema: 'talaria.h-a8-vp-2-corrected-run/v1',
  product: process.env.DIAG_PRODUCT,
  productCommit: process.env.DIAG_COMMIT,
  buildId: process.env.DIAG_BUILD_ID,
  run: Number(process.env.DIAG_RUN),
  port,
  startedAt,
  endedAt: new Date().toISOString(),
  browserVersion,
  userAgent,
  viewport: { width: 1440, height: 960, deviceScaleFactor: 1 },
  killSwitchInputs: false,
  fixedSyntheticNowMs: fixedNowMs,
  checks,
  failurePoints: checks.filter((item) => !item.ok).map((item) => item.label),
  semanticSignatureSha256: match?.[1] || null,
  semanticCanonical: match?.[2] || null,
  correctedScenarioSha256: hash(fs.readFileSync(path.join(correctedHarness, 'react-parity-scenarios.mjs'))),
  correctedSignatureModuleSha256: hash(fs.readFileSync(path.join(correctedHarness, 'h-a8-vp-2-semantic-signature.mjs'))),
  error,
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
if (error) process.exit(2);
if (artifact.failurePoints.length !== 1 || artifact.failurePoints[0] !== 'H-A8-VP-2 CORE-B: canvas drag moves anchor') {
  process.exit(3);
}
process.exit(0);
