/**
 * M20-A favorites harness runner (zero-install, real browser).
 *
 * Drives the locally installed Chromium-based browser (Edge/Chrome) headless
 * against m20-a-favorites-harness.html, which executes:
 *   • RED rows on the AUTHENTIC pre-fix blob (sha 091e2467…),
 *   • GREEN rows on the current product source (both trees),
 *   • the exact-kill A/B (prefix vs current+kill) with full ordered logs.
 *
 * Writes: docs/plan3/evidence/W4-M20-A-FAVORITES-BROWSER-20260724.json
 *
 * Usage: node "chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness-run.mjs"
 */
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarnessServer } from './m20-a-favorites-harness-serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 14; i += 1) {
    if (
      existsSync(join(dir, 'docs', 'plan3'))
      && existsSync(join(dir, 'chart v 1.4'))
      && existsSync(join(dir, 'homepage'))
    ) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`repo root not found above ${start}`);
}

const REPO_ROOT = findRepoRoot(HERE);
const STAMP = '20260724';
const PORT = 8991;
const PAGE = '/chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness.html';

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

async function atomicWriteText(out, text) {
  const dir = dirname(out);
  await mkdir(dir, { recursive: true });
  const tmp = join(
    dir,
    `.${basename(out)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    await writeFile(tmp, text, 'utf8');
    await rename(tmp, out);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

const HASHES = {
  'prefix blob (authentic pre-fix)': sha256(join(HERE, 'blobs', 'favorites-manager.prefix.js')),
  'favorites-manager.js (canonical)': sha256(join(REPO_ROOT, 'chart v 1.4', 'chart', 'modules', 'favorites-manager.js')),
  'favorites-manager.js (homepage)': sha256(join(REPO_ROOT, 'homepage', 'public', 'chart', 'modules', 'favorites-manager.js')),
  'harness client': sha256(join(HERE, 'm20-a-favorites-harness.client.mjs')),
  'harness html': sha256(join(HERE, 'm20-a-favorites-harness.html')),
  'harness serve': sha256(join(HERE, 'm20-a-favorites-harness-serve.mjs')),
  'harness run (this file)': sha256(fileURLToPath(import.meta.url)),
};

const browserPath = BROWSER_CANDIDATES.find((p) => p && existsSync(p)) || null;

let report = null;
let blocked = null;

if (!browserPath) {
  blocked = 'no Chromium-based browser found (Edge/Chrome candidates all missing); installs prohibited';
  console.error(`[m20a-fav] BLOCKED: ${blocked}`);
} else {
  console.log(`[m20a-fav] browser: ${browserPath}`);
  let reportResolve;
  const reportPromise = new Promise((r) => { reportResolve = r; });
  const server = await startHarnessServer({
    repoRoot: REPO_ROOT,
    port: PORT,
    onReport: (r) => reportResolve(r),
  });
  const url = `http://127.0.0.1:${PORT}${encodeURI(PAGE)}`;
  const profile = await mkdtemp(join(tmpdir(), 'm20a-fav-'));
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderrTail = '';
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-2000); });

  const timeoutMs = 90000;
  report = await Promise.race([
    reportPromise,
    new Promise((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
  await new Promise((resolveKill) => {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => resolveKill());
  });
  await new Promise((r) => server.close(r));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  if (!report) blocked = `no /report within ${timeoutMs}ms; stderr tail: ${stderrTail || '(empty)'}`;
}

const verdict = blocked
  ? 'BLOCKED'
  : (report.verdict === 'HARNESS-PASS' ? 'BROWSER-PASS' : 'BROWSER-FAIL');

const evidence = {
  worker: 'W4-FABLE-CORRECTION',
  fix: 'M20-A-FAVORITES-BROWSER',
  stamp: STAMP,
  verdict,
  blocked,
  browser: browserPath,
  sourceHashes: HASHES,
  preFixProvenance: {
    gitObject: '32c916dd0464de6b22042b6c6c1257570313dce8',
    sha256Raw: HASHES['prefix blob (authentic pre-fix)'],
    rawBytes: 46519,
    lineEndings: 'raw bytes are pure LF; LF-normalization is identity (same sha256)',
    sha256Crlf: '754c77f4832e56b2284f1a4a2ce43078192cae371e0524068b62f823284d5382',
    sha256BomRaw: 'a81660f993b9588fa138bdb97035570542ab27d858e1f32034cadf2bd04f592e',
    origin: 'git show HEAD:"chart v 1.4/chart/modules/favorites-manager.js" (frozen byte-for-byte in blobs/, see blobs/SHA256SUMS)',
    composerIntermediate: {
      sha256: 'fb7eac001cfa18287c6d7134db61e50da8ea9b8aaf4b6246c8065474da63e0de',
      bytes: 49043,
      note: 'NOT a Git/pre-fix blob. It IS a reconstructable Composer intermediate of favorites-manager.js after Composer\u2019s recorded setup/export edits (verified by the fresh GPT review; CRLF companion 7f157fab\u2026). Forensic artifact only \u2014 the authentic immutable RED source is the HEAD blob above.',
    },
  },
  replay: `node "<repo>/chart v 1.4/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness-run.mjs"`,
  node: process.version,
  generatedAt: new Date().toISOString(),
  report,
};

const evidenceDir = join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const evidencePath = join(evidenceDir, `W4-M20-A-FAVORITES-BROWSER-${STAMP}.json`);
await atomicWriteText(evidencePath, JSON.stringify(evidence, null, 2) + '\n');

console.log(`[m20a-fav] evidence → ${evidencePath}`);
if (report) {
  console.log(`[m20a-fav] ${report.verdict} (${report.pass} pass / ${report.fail} fail) — ${report.userAgent}`);
  for (const row of report.rows.filter((x) => !x.pass)) {
    console.log(`  FAIL [${row.q}] ${row.name} — ${row.detail}`);
  }
}
console.log(`[m20a-fav] ${verdict}`);
process.exit(verdict === 'BROWSER-PASS' ? 0 : 1);
