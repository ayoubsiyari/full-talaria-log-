import fs from 'node:fs';
import path from 'node:path';

export const MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH = '__TALARIA_DISABLE_MC_HOST_BUS_RETRY_TIMER_CLEANUP_V1';

export const PRODUCT_FILES = Object.freeze({
  talariaLive: 'chart v 1.4/talaria-design/src/TalariaV8bLive.jsx',
  multichartGrid: 'chart v 1.4/talaria-design/src/MultichartGrid.jsx',
  v16SupportChat: 'homepage/src/app/dashboard/v16/V16SupportChatPopover.tsx',
  preferencesSync: 'chart v 1.4/chart/modules/preferences-sync.js',
  chartIndicatorsFull: 'chart v 1.4/chart/modules/chart-indicators-full.js',
  customIndicatorsRuntime: 'chart v 1.4/chart/modules/custom-indicators-runtime.js',
});

const START_PATTERNS = Object.freeze([
  ['setInterval', /\bsetInterval\s*\(/g],
  ['setTimeout', /\bsetTimeout\s*\(/g],
  ['requestAnimationFrame', /\brequestAnimationFrame\s*\(/g],
  ['window.requestAnimationFrame', /\bwindow\.requestAnimationFrame\s*\(/g],
  ['new Worker', /\bnew\s+Worker\s*\(/g],
  ['new SharedWorker', /\bnew\s+SharedWorker\s*\(/g],
  ['new WebSocket', /\bnew\s+WebSocket\s*\(/g],
  ['new EventSource', /\bnew\s+EventSource\s*\(/g],
  ['new BroadcastChannel', /\bnew\s+BroadcastChannel\s*\(/g],
  ['new MessageChannel', /\bnew\s+MessageChannel\s*\(/g],
  ['new ResizeObserver', /\bnew\s+ResizeObserver\s*\(/g],
  ['new MutationObserver', /\bnew\s+MutationObserver\s*\(/g],
  ['new IntersectionObserver', /\bnew\s+IntersectionObserver\s*\(/g],
  ['new PerformanceObserver', /\bnew\s+PerformanceObserver\s*\(/g],
  ['window.addEventListener', /\bwindow\.addEventListener\s*\(/g],
  ['document.addEventListener', /\bdocument\.addEventListener\s*\(/g],
  ['parent.addEventListener', /\bparent\.addEventListener\s*\(/g],
]);

const CENSUS_ROOTS = Object.freeze([
  'chart v 1.4/chart',
  'chart v 1.4/talaria-design/src',
  'homepage/src/app',
]);

function readRequired(root, rel) {
  const abs = path.join(root, rel);
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch (err) {
    throw new Error(`TIMER-OUTLIVES-OWNER sweep expected readable source file: ${rel}: ${err.message}`);
  }
}

function lineOf(source, needle) {
  const idx = source.indexOf(needle);
  if (idx < 0) return null;
  return source.slice(0, idx).split(/\r?\n/).length;
}

function has(source, pattern) {
  return pattern.test(source);
}

function blockHas(source, blockStart, required) {
  const start = source.indexOf(blockStart);
  if (start < 0) return false;
  const tail = source.slice(start, start + 1200);
  const end = tail.search(/\n\s*\};/);
  if (end < 0) return false;
  return required.test(tail.slice(0, end));
}

function reset(pattern) {
  pattern.lastIndex = 0;
  return pattern;
}

function walkFiles(root, dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (rel.includes('/node_modules/') || rel === 'node_modules') continue;
      if (rel === 'homepage/public/chart' || rel.startsWith('homepage/public/chart/')) continue;
      if (/\/dist[^/]*($|\/)/.test(`/${rel}/`)) continue;
      walkFiles(root, abs, out);
      continue;
    }
    if (!/\.(mjs|js|jsx|ts|tsx)$/.test(entry.name)) continue;
    out.push(abs);
  }
}

export function enumerateStartSites(root = process.cwd()) {
  const files = [];
  for (const relRoot of CENSUS_ROOTS) {
    const absRoot = path.join(root, relRoot);
    if (fs.existsSync(absRoot)) walkFiles(root, absRoot, files);
  }
  const sites = [];
  for (const abs of files.sort()) {
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    const source = fs.readFileSync(abs, 'utf8');
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [kind, pattern] of START_PATTERNS) {
        if (reset(pattern).test(line)) {
          sites.push({
            file: rel,
            line: i + 1,
            kind,
            owner: 'UNPROVEN by static census',
            cleanup: 'UNPROVEN',
            cleanupPaths: [],
            verdict: 'UNPROVEN',
            code: line.trim(),
          });
        }
      }
    }
  }
  return sites;
}

function pass(name, verdict, file, line, cleanup, cleanupPaths, owner) {
  return { name, passed: true, verdict, file, line, cleanup, cleanupPaths, owner };
}

function fail(name, verdict, file, line, reason) {
  return { name, passed: false, verdict, file, line, reason };
}

export function analyzeTimerOutlivesOwnerSweep(options = {}) {
  const root = options.root || process.cwd();
  const sources = {};
  for (const [key, rel] of Object.entries(PRODUCT_FILES)) {
    sources[key] = readRequired(root, rel);
  }

  const results = [];
  const live = sources.talariaLive;
  const liveLine = lineOf(live, 'supportPingTimerRef.current = setInterval');
  if (has(live, /supportClearPingTimer\s*=\s*\(\)\s*=>[\s\S]*?clearInterval\(supportPingTimerRef\.current\)/)
    && has(live, /ws\.readyState\s*!==\s*WebSocket\.OPEN[\s\S]*?supportClearPingTimer\(\)/)
    && blockHas(live, 'ws.onclose = () => {', /supportDisconnectWs\(\)/)) {
    results.push(pass(
      'talaria-live-support-ws-ping-cleanup',
      'CLEAN',
      PRODUCT_FILES.talariaLive,
      liveLine,
      'supportClearPingTimer clears interval; ws.onclose reaches supportDisconnectWs',
      ['happy path: supportDisconnectWs before reconnect/unmount', 'natural death: ws.onclose for current socket', 'tick path: CLOSED/CLOSING readyState self-clears'],
      'support inbox WebSocket ping'
    ));
  } else {
    results.push(fail('talaria-live-support-ws-ping-cleanup', 'DEFECT', PRODUCT_FILES.talariaLive, liveLine, 'missing clear function, readyState self-clear, or onclose -> disconnect path'));
  }

  const v16 = sources.v16SupportChat;
  const v16Line = lineOf(v16, 'pingRef.current = setInterval');
  if (has(v16, /clearPingTimer\s*=\s*useCallback\(\(\)\s*=>[\s\S]*?clearInterval\(pingRef\.current\)/)
    && has(v16, /ws\.readyState\s*!==\s*WebSocket\.OPEN[\s\S]*?clearPingTimer\(\)/)
    && blockHas(v16, 'ws.onclose = () => {', /disconnectWs\(\)/)
    && has(v16, /return\s*\(\)\s*=>\s*disconnectWs\(\)/)) {
    results.push(pass(
      'v16-support-ws-ping-cleanup',
      'CLEAN',
      PRODUCT_FILES.v16SupportChat,
      v16Line,
      'clearPingTimer clears interval; ws.onclose and effect cleanup reach disconnectWs',
      ['happy path: closed panel/effect cleanup', 'natural death: ws.onclose for current socket', 'tick path: CLOSED/CLOSING readyState self-clears'],
      'V16 support inbox WebSocket ping'
    ));
  } else {
    results.push(fail('v16-support-ws-ping-cleanup', 'DEFECT', PRODUCT_FILES.v16SupportChat, v16Line, 'missing clear function, readyState self-clear, onclose -> disconnect, or effect cleanup'));
  }

  const mc = sources.multichartGrid;
  const replayLine = lineOf(mc, 'const replayAlignGuard = setInterval');
  if (has(mc, /const\s+replayAlignGuard\s*=\s*setInterval\(/)
    && has(mc, /return\s*\(\)\s*=>\s*\{[\s\S]*?clearInterval\(replayAlignGuard\)/)) {
    results.push(pass(
      'multichart-replay-align-guard-cleanup',
      'CLEAN',
      PRODUCT_FILES.multichartGrid,
      replayLine,
      'effect cleanup clears replayAlignGuard',
      ['happy path: layout returns to 1/unmount', 'owner replaced: React effect unmount removes replay listeners and restores patched replaySystem'],
      'multichart replay alignment poll'
    ));
  } else {
    results.push(fail('multichart-replay-align-guard-cleanup', 'DEFECT', PRODUCT_FILES.multichartGrid, replayLine, 'replayAlignGuard interval is not cleared in the effect cleanup'));
  }

  const hostLine = lineOf(mc, 'hostBusRetryInterval = setInterval');
  if (has(mc, new RegExp(MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH))
    && has(mc, /function\s+mcHostBusRetryTimerCleanupV1Enabled\(\)[\s\S]*?return\s+!\(typeof window !== "undefined" && window\[MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH\]\)/)
    // The cleanup must be gated on its OWN switch and nothing else. A
    // disjunction with the purge switch reads as a safe superset but welds the
    // two flags together, which the flag protocol blocks.
    && has(mc, /if\s*\(hostBusRetryInterval\s*&&\s*mcHostBusRetryTimerCleanupV1Enabled\(\)\)\s*\{[\s\S]*?clearInterval\(hostBusRetryInterval\)/)
    && !has(mc, /mcHostBusRetryTimerCleanupV1Enabled\(\)\s*\|\|\s*mcGridStatePurgeV1Enabled\(\)/)) {
    results.push(pass(
      'multichart-host-bus-retry-cleanup',
      'CLEAN',
      PRODUCT_FILES.multichartGrid,
      hostLine,
      `effect cleanup clears hostBusRetryInterval unless ${MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH} is truthy; independent of the purge switch`,
      ['happy path: bus ready/50 attempts self-clear', 'natural death: React effect unmount clears retry interval by default'],
      'host order bus retry poll'
    ));
  } else {
    results.push(fail('multichart-host-bus-retry-cleanup', 'DEFECT', PRODUCT_FILES.multichartGrid, hostLine, 'dedicated default-on host bus retry cleanup is missing'));
  }

  const prefs = sources.preferencesSync;
  const syncLine = lineOf(prefs, 'this.syncTimer = setTimeout');
  if (has(prefs, /if\s*\(this\.syncTimer\)\s*\{[\s\S]*?clearTimeout\(this\.syncTimer\)/)
    && has(prefs, /_onCloudSubscriptionBlocked\(\)[\s\S]*?clearTimeout\(this\.syncTimer\)[\s\S]*?this\.syncTimer\s*=\s*null/)) {
    results.push(pass(
      'preferences-sync-debounce-cleanup',
      'CLEAN',
      PRODUCT_FILES.preferencesSync,
      syncLine,
      'reschedule and subscription-block paths clear syncTimer',
      ['happy path: later schedule clears prior debounce before arming a new one', 'natural death: subscription block clears pending debounce and leaves local-only product path working'],
      'cloud preferences debounce'
    ));
  } else {
    results.push(fail('preferences-sync-debounce-cleanup', 'DEFECT', PRODUCT_FILES.preferencesSync, syncLine, 'syncTimer debounce cleanup paths are missing'));
  }

  const ownerLine = lineOf(prefs, 'ownerTimer = setInterval');
  if (has(prefs, /function\s+stopOwnerWatch\(\)\s*\{[\s\S]*?clearInterval\(ownerTimer\)[\s\S]*?ownerTimer\s*=\s*null/)
    && has(prefs, /if\s*\(ownerReady\(\)\)\s*\{[\s\S]*?stopOwnerWatch\(\)[\s\S]*?drainPending\(\)/)
    && has(prefs, /attempts\s*>=\s*OWNER_POLL_MAX[\s\S]*?stopOwnerWatch\(\)/)) {
    results.push(pass(
      'preferences-owner-watch-cleanup',
      'CLEAN',
      PRODUCT_FILES.preferencesSync,
      ownerLine,
      'stopOwnerWatch clears ownerTimer',
      ['happy path: ownerReady -> stopOwnerWatch -> drainPending', 'natural death: OWNER_POLL_MAX -> stopOwnerWatch and reject waiters'],
      'preferences owner resolution poll'
    ));
  } else {
    results.push(fail('preferences-owner-watch-cleanup', 'DEFECT', PRODUCT_FILES.preferencesSync, ownerLine, 'owner poll interval cleanup paths are missing'));
  }

  const ind = sources.chartIndicatorsFull;
  const indLine = lineOf(ind, "new Worker('/chart/workers/indicator-worker.js')");
  if (has(ind, /new\s+Worker\('\/chart\/workers\/indicator-worker\.js'\)/)
    && !has(ind, /\.terminate\s*\(/)) {
    results.push(pass(
      'indicator-worker-singleton-leak-escalation',
      'DEFECT',
      PRODUCT_FILES.chartIndicatorsFull,
      indLine,
      'no cleanup in owner module; escalation required',
      ['reachable: recalculateIndicators custom path calls _getIndicatorWorker; per-iframe realm creates one module singleton', 'natural death: iframe/panel teardown has no terminate call in this module'],
      'indicator calculation worker singleton'
    ));
  } else {
    results.push(fail('indicator-worker-singleton-leak-escalation', 'DEFECT', PRODUCT_FILES.chartIndicatorsFull, indLine, 'expected out-of-set worker singleton defect shape changed'));
  }

  const custom = sources.customIndicatorsRuntime;
  const customLine = lineOf(custom, 'worker = new Worker(workerUrl)');
  if (has(custom, /worker\s*=\s*new\s+Worker\(workerUrl\)/)
    && has(custom, /if\s*\(worker\)\s*worker\.terminate\(\)/)
    && has(custom, /Custom indicator timed out/)) {
    results.push(pass(
      'custom-indicator-worker-timeout-cleanup',
      'UNPROVEN',
      PRODUCT_FILES.customIndicatorsRuntime,
      customLine,
      'timeout path terminates worker; normal owner teardown path not established by source sweep',
      ['timeout/error: item timer terminates worker', 'UNPROVEN: chart/panel teardown while worker is idle or busy'],
      'custom indicator runtime worker'
    ));
  } else {
    results.push(fail('custom-indicator-worker-timeout-cleanup', 'UNPROVEN', PRODUCT_FILES.customIndicatorsRuntime, customLine, 'timeout terminate evidence is missing or changed'));
  }

  const census = enumerateStartSites(root);
  const counts = { CLEAN: 0, DEFECT: 0, UNPROVEN: 0 };
  for (const row of results) {
    if (!row.passed || !row.line) continue;
    const site = census.find((candidate) => candidate.file === row.file && candidate.line === row.line);
    if (!site) continue;
    site.verdict = row.verdict;
    site.owner = row.owner || site.owner;
    site.cleanup = row.cleanup || site.cleanup;
    site.cleanupPaths = row.cleanupPaths || site.cleanupPaths;
    site.assertion = row.name;
  }
  for (const site of census) counts[site.verdict] += 1;
  return { root, productFiles: PRODUCT_FILES, census, assertions: results, counts };
}

export function assertTimerOutlivesOwnerSweep(options = {}) {
  const analysis = analyzeTimerOutlivesOwnerSweep(options);
  const failures = analysis.assertions.filter((row) => !row.passed);
  if (failures.length) {
    const detail = failures.map((row) => `${row.name}: ${row.reason}`).join('\n');
    throw new Error(`TIMER-OUTLIVES-OWNER sweep failed:\n${detail}`);
  }
  return analysis;
}
