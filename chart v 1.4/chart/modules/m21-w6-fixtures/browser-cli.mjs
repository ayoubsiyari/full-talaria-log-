/**
 * W6 TEST-FIXTURE tooling — zero-dependency Chromium CLI launcher.
 *
 * Mirrors W3 m21-2-browser-harness-run pattern: locally installed Edge/Chrome
 * only. No puppeteer/playwright imports. No installs.
 */
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

export function findLocalChromiumBrowser() {
  return BROWSER_CANDIDATES.find((p) => p && existsSync(p)) || null;
}

export function killProcessTree(pid) {
  return new Promise((resolveKill) => {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolveKill());
      return;
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch (_) { /* ignore */ }
    resolveKill();
  });
}

/**
 * Open url in headless Chromium; wait for reportPromise or timeout.
 * Caller owns the reportPromise (usually HTTP POST /report).
 */
export async function runHeadlessUrl({
  browserPath,
  url,
  reportPromise,
  timeoutMs = 60_000,
  profilePrefix = 'm21-w6-browser-',
  /** Expose performance.memory + window.gc() for usedJSHeapSize instruments. */
  preciseMemory = false,
  extraArgs = [],
}) {
  const profile = await mkdtemp(join(tmpdir(), profilePrefix));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${profile}`,
    '--window-size=1280,900',
    ...(preciseMemory
      ? ['--enable-precise-memory-info', '--js-flags=--expose-gc']
      : []),
    ...(Array.isArray(extraArgs) ? extraArgs : []),
    url,
  ];
  const child = spawn(browserPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderrTail = '';
  child.stderr.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-2000);
  });

  const report = await Promise.race([
    reportPromise,
    new Promise((r) => setTimeout(() => r(null), timeoutMs)),
  ]);

  await killProcessTree(child.pid);
  await rm(profile, { recursive: true, force: true }).catch(() => {});

  return {
    report,
    timedOut: report == null,
    stderrTail,
    browserPath,
    url,
  };
}

export function browserVersionLabel(browserPath) {
  if (!browserPath) return null;
  if (/msedge/i.test(browserPath)) return 'Microsoft Edge (Chromium CLI)';
  if (/chrome/i.test(browserPath)) return 'Google Chrome (Chromium CLI)';
  if (/chromium/i.test(browserPath)) return 'Chromium CLI';
  return 'Chromium-based CLI';
}
