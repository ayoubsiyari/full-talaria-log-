/**
 * M21-2 — browser-harness runner (W3-owned, NEW FILE, zero-install).
 *
 * puppeteer/playwright are NOT installed in this repo (W6's lwc proto-test
 * imports puppeteer but it is absent — flagged to reviewer), so this runner
 * drives the locally installed Chromium-based browser (Microsoft Edge /
 * Chrome) in headless mode directly via CLI and collects results through the
 * harness page's POST /report callback. Nothing is installed or modified.
 *
 * Runs BOTH trees (canonical "chart v 1.4" + homepage/public mirror) and
 * writes PRELIMINARY-SCAFFOLD-BROWSER evidence:
 *   docs/plan3/evidence/W3-M21-2-BROWSER-HARNESS-20260724.PRELIMINARY.json
 *
 * Usage: node "chart v 1.4/chart/modules/m21-2-browser-harness/m21-2-browser-harness-run.mjs"
 */
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarnessServer } from './m21-2-browser-harness-serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Tree-agnostic repo root: walk up until docs/plan3 exists, so the
// byte-identical homepage mirror of this file resolves the same root.
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, 'docs', 'plan3'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error('repo root (docs/plan3) not found above ' + start);
}
const REPO_ROOT = findRepoRoot(HERE);
const PAGE_PATH = '/chart/modules/m21-2-browser-harness/m21-2-browser-harness.html';
const STAMP = '20260724';

const TREES = [
  { tree: 'canonical', chartRoot: join(REPO_ROOT, 'chart v 1.4', 'chart'), port: 8976 },
  { tree: 'homepage', chartRoot: join(REPO_ROOT, 'homepage', 'public', 'chart'), port: 8977 },
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

function killTree(pid) {
  return new Promise((resolveKill) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolveKill());
  });
}

async function runTree({ tree, chartRoot, port }, browserPath) {
  let reportResolve;
  const reportPromise = new Promise((r) => { reportResolve = r; });
  const server = await startHarnessServer({
    chartRoot,
    port,
    onReport: (report) => reportResolve(report),
  });
  const url = `http://127.0.0.1:${port}${PAGE_PATH}`;
  const profile = await mkdtemp(join(tmpdir(), 'm212-harness-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    url,
  ];
  console.log(`[run] ${tree}: ${url}`);
  const child = spawn(browserPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderrTail = '';
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });

  const timeoutMs = 60000;
  const report = await Promise.race([
    reportPromise,
    new Promise((r) => setTimeout(() => r(null), timeoutMs)),
  ]);

  await killTree(child.pid);
  await new Promise((r) => server.close(r));
  await rm(profile, { recursive: true, force: true }).catch(() => {});

  if (!report) {
    return {
      tree, chartRoot, url, ok: false, timedOut: true,
      detail: `no /report POST within ${timeoutMs}ms; browser stderr tail: ${stderrTail || '(empty)'}`,
    };
  }
  return { tree, chartRoot, url, ok: report.verdict === 'HARNESS-PASS', timedOut: false, report };
}

const browserPath = findBrowser();
const runs = [];
let blocked = null;

if (!browserPath) {
  blocked = 'no Chromium-based browser found (Edge/Chrome candidates all missing) and installs are prohibited';
  console.error(`[run] BLOCKED: ${blocked}`);
} else {
  console.log(`[run] browser: ${browserPath}`);
  for (const t of TREES) {
    runs.push(await runTree(t, browserPath));
  }
}

const allPass = !blocked && runs.length === TREES.length && runs.every((r) => r.ok);
const evidence = {
  worker: 'W3',
  mode: 'M21-2-BROWSER-HARNESS',
  stamp: STAMP,
  status: 'PRELIMINARY-SCAFFOLD-BROWSER',
  verdict: blocked ? 'BLOCKED-NO-BROWSER' : (allPass ? 'HARNESS-PASS' : 'HARNESS-FAIL'),
  disclaimer: 'Standalone scaffold browser-integration evidence ONLY. Pixel rows are a scaffold-only '
    + 'checksum/spot oracle — explicitly NOT product pixel parity and NOT a performance GREEN. '
    + 'Product pixel/perf claims stay NOT-MEASURABLE until W5 instruments the wired build.',
  browser: browserPath,
  blocked,
  runs,
  generatedAt: new Date().toISOString(),
};

const evidenceDir = join(REPO_ROOT, 'docs', 'plan3', 'evidence');
await mkdir(evidenceDir, { recursive: true });
const evidencePath = join(evidenceDir, `W3-M21-2-BROWSER-HARNESS-${STAMP}.PRELIMINARY.json`);
await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');

console.log(`\n[run] evidence → ${evidencePath}`);
for (const r of runs) {
  if (r.timedOut) { console.log(`  ${r.tree}: TIMEOUT — ${r.detail}`); continue; }
  console.log(`  ${r.tree}: ${r.report.verdict} (${r.report.pass} pass / ${r.report.fail} fail)`);
  for (const row of r.report.rows.filter((x) => !x.pass)) {
    console.log(`    FAIL ${row.q} ${row.name} — ${row.detail}`);
  }
  for (const iss of r.report.reviewerIssues || []) {
    console.log(`    ISSUE ${iss.id}: ${iss.text}`);
  }
}
console.log(`\n[run] ${evidence.verdict}`);
process.exit(allPass ? 0 : 1);
