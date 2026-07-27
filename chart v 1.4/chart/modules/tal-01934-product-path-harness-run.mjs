import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const chartRoot = resolve(here, '..');
const port = 8994;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};
let resolveReport;
const server = http.createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'POST' && req.url === '/report') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolveReport(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (error) { resolveReport({ verdict: 'HARNESS-FAIL', parseError: String(error) }); }
      res.statusCode = 204; res.end();
    });
    return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [], candles: [], success: true }));
    return;
  }
  if (!url.pathname.startsWith('/chart/')) { res.statusCode = 404; res.end(); return; }
  const abs = resolve(join(chartRoot, url.pathname.slice('/chart/'.length)));
  if (abs !== chartRoot && !abs.startsWith(chartRoot + sep)) { res.statusCode = 403; res.end(); return; }
  try {
    const data = await readFile(abs);
    res.setHeader('content-type', types[extname(abs).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const candidates = [
  { name: 'edge-x86', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'edge-x64', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
  { name: 'chrome-x64', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
];
const browsers = candidates.filter((candidate) => existsSync(candidate.path));
if (!browsers.length) {
  server.close();
  throw new Error('no installed Chromium browser');
}
const url = `http://127.0.0.1:${port}/chart/modules/tal-01934-product-path-harness.html`;
const modes = [
  { name: 'headless-new', flag: '--headless=new' },
  { name: 'headless-default', flag: '--headless' },
];
const runs = [];
for (const browser of browsers) {
  for (const mode of modes) {
    const profile = await mkdtemp(join(tmpdir(), 'tal01934-realpath-'));
    let reportPromise;
    reportPromise = new Promise((r) => { resolveReport = r; });
    const child = spawn(browser.path, [
      mode.flag, '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--disable-background-networking', `--user-data-dir=${profile}`, '--window-size=1200,900', url,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-4000); });
    const report = await Promise.race([
      reportPromise,
      new Promise((r) => setTimeout(() => r({ verdict: 'HARNESS-FAIL', timeout: true, stderr }), 180000)),
    ]);
    resolveReport = null;
    await new Promise((r) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => r()));
    runs.push({ browser: browser.name, executable: browser.path, mode: mode.name, report });
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
        break;
      } catch (error) {
        if (attempt === 5) console.error(`[cleanup] bounded profile removal failed: ${error}`);
        else await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
  }
}
await new Promise((r) => server.close(r));
const verdict = runs.every((run) => run.report.verdict === 'HARNESS-PASS')
  ? 'HARNESS-PASS'
  : 'HARNESS-FAIL';
console.log(JSON.stringify({ verdict, availableChromiumRuns: runs.length, runs }, null, 2));
process.exit(verdict === 'HARNESS-PASS' ? 0 : 1);
