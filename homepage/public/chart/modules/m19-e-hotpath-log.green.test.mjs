/**
 * M19-E unit checks (lazy / debug / warn-error) + soak focus evidence.
 *
 *   node "chart v 1.4/chart/modules/m19-e-hotpath-log.green.test.mjs"
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  process.stdout.write(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

let logCalls = 0;
let warnCalls = 0;
let errorCalls = 0;
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;
console.log = (...args) => { logCalls += 1; };
console.warn = (...args) => { warnCalls += 1; };
console.error = (...args) => { errorCalls += 1; };

global.performance = performance;
global.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  location: { href: 'http://local.test/chart?sessionId=m19-e' },
  parent: null,
  chart: null,
  postMessage() {},
  __TALARIA_DISABLE_M19_MARKER_DELTA_V1: false,
  __TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1: false,
  __TALARIA_DEBUG: false,
  __TALARIA_M19_HOTPATH_LOGS: false,
  __ORDER_MANAGER_DEBUG__: false,
};
global.document = {
  getElementById: () => ({
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    innerHTML: '',
    textContent: '',
    value: '',
  }),
  createElement: () => global.document.getElementById(),
  body: { appendChild() {} },
  querySelector() { return null; },
};
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.HTMLElement = class {};
global.Node = class {};
global.CustomEvent = class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
global.fetch = async () => ({ ok: true, json: async () => ({}) });

require('./order-manager.js');
const hotpathLog = globalThis.__TALARIA_M19_HOTPATH_LOG;
check('helper-exported', typeof hotpathLog === 'function');

// Guard ON, debug OFF → no log, factory not evaluated
{
  window.__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1 = false;
  window.__TALARIA_DEBUG = false;
  window.__TALARIA_M19_HOTPATH_LOGS = false;
  window.__ORDER_MANAGER_DEBUG__ = false;
  logCalls = 0;
  let built = 0;
  hotpathLog(() => {
    built += 1;
    return `expensive ${'x'.repeat(1000)}`;
  });
  check('lazy-not-built-when-disabled', built === 0 && logCalls === 0, `built=${built} logs=${logCalls}`);
}

// Kill switch OFF path (legacy) → factory runs
{
  window.__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1 = true;
  logCalls = 0;
  let built = 0;
  hotpathLog(() => {
    built += 1;
    return ['off-path', 1];
  });
  check('kill-switch-logs', built === 1 && logCalls === 1, `built=${built} logs=${logCalls}`);
  window.__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1 = false;
}

// Debug flag restores logs under guard
{
  window.__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1 = false;
  window.__TALARIA_M19_HOTPATH_LOGS = true;
  logCalls = 0;
  let built = 0;
  hotpathLog(() => {
    built += 1;
    return 'debug-on';
  });
  check('debug-restores-logs', built === 1 && logCalls === 1, `built=${built} logs=${logCalls}`);
  window.__TALARIA_M19_HOTPATH_LOGS = false;
}

// warn/error untouched even when guard suppresses log
{
  window.__TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1 = false;
  window.__TALARIA_M19_HOTPATH_LOGS = false;
  logCalls = 0;
  warnCalls = 0;
  errorCalls = 0;
  hotpathLog('should-not-appear');
  console.warn('warn-ok');
  console.error('error-ok');
  check('warn-error-untouched', logCalls === 0 && warnCalls === 1 && errorCalls === 1,
    `log=${logCalls} warn=${warnCalls} err=${errorCalls}`);
}

console.log = origLog;
console.warn = origWarn;
console.error = origError;

const unitFailed = results.some((r) => !r.pass);
const unitPath = path.join(ROOT, 'docs/plan3/evidence/L2-M19-E-unit.json');
fs.mkdirSync(path.dirname(unitPath), { recursive: true });
fs.writeFileSync(unitPath, JSON.stringify({
  task: 'M19-E-unit',
  pass: !unitFailed,
  results,
}, null, 2));

if (unitFailed) {
  process.stdout.write('M19-E unit FAIL — skipping soak focus\n');
  process.exitCode = 1;
} else {
  process.stdout.write('M19-E unit PASS — running soak focus E\n');
  const soak = path.join(__dirname, 'm19-progressive-session-soak.test.mjs');
  const r = spawnSync(process.execPath, [soak], {
    cwd: ROOT,
    env: { ...process.env, M19_FOCUS: 'E' },
    encoding: 'utf8',
    timeout: 600_000,
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  process.exitCode = r.status == null ? 1 : r.status;
}
