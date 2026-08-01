/**
 * Find the live soak browser's DevTools port, and identify WHICH browser it is.
 *
 * Written after a silent failure that cost a seven-minute observation: the ten-hour run is a CHAIN of
 * segments, each with its own freshly launched browser on an ephemeral port. My probes defaulted to a
 * hard-coded 49797, so when segment 1 rolled to segment 2 mid-observation they attached to a browser that was
 * about to be torn down, produced nothing, and reported "no frames" as though the page were quiet.
 *
 * Two jobs, and the second matters more than the first:
 *   1. discover the port rather than assume it;
 *   2. return a browser IDENTITY so a caller can assert the same browser at the start and end of a
 *      measurement. A segment roll must void a measurement loudly, not empty it silently.
 */
import { execFileSync } from 'node:child_process';

function chromeListeningPorts() {
  const ps = [
    '$pids = (Get-Process chrome -ErrorAction SilentlyContinue).Id;',
    'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |',
    'Where-Object { $pids -contains $_.OwningProcess } |',
    'Select-Object -ExpandProperty LocalPort -Unique',
  ].join(' ');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 30_000 });
    return out.split(/\r?\n/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

async function probe(port) {
  try {
    const ctl = AbortSignal.timeout(2000);
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: ctl })).json();
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json();
    const pages = list.filter((t) => t.type === 'page');
    const chartPages = pages.filter((t) => /chart/i.test(t.url));
    return { port, browser: version.Browser, webSocketDebuggerUrl: version.webSocketDebuggerUrl, pages: pages.length, chartPages: chartPages.length, chartUrl: chartPages[0]?.url || null };
  } catch {
    return null;
  }
}

/**
 * @param {number[]} preferred ports to try first, e.g. one a caller was told about.
 * @returns {Promise<{port:number, identity:string, chartUrl:string|null}|null>}
 */
export async function findSoakBrowser(preferred = []) {
  const seen = new Set();
  const order = [...preferred, ...chromeListeningPorts()].filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  const found = [];
  for (const p of order) {
    const r = await probe(p);
    if (r) found.push(r);
  }
  if (!found.length) return null;
  // A browser with a chart page is the soak. If several qualify, take the one with the most chart pages.
  found.sort((a, b) => b.chartPages - a.chartPages || b.pages - a.pages);
  const best = found[0];
  return {
    port: best.port,
    // The ws GUID is unique per browser process, so it is the segment fingerprint.
    identity: String(best.webSocketDebuggerUrl || `${best.browser}:${best.port}`),
    chartUrl: best.chartUrl,
    chartPages: best.chartPages,
    candidates: found.map((f) => ({ port: f.port, chartPages: f.chartPages })),
  };
}

/**
 * Reap chrome renderers whose browser process is gone.
 *
 * Segment 1's browser exited at 22:16 and left its renderer alive: pid 30588 ran for another 67 minutes at
 * ~120% of a core holding 2,489 MB private, sharing the host with the segment that replaced it. A renderer
 * cannot be closed by anything but its browser, so once the browser is gone nothing will ever reap it. This
 * runs before a segment boots, so a segment never starts underneath the corpse of its predecessor.
 *
 * Only orphans are touched: a renderer whose parent pid is still a live chrome process is somebody's working
 * browser and is left alone.
 */
export function reapOrphanedRenderers({ dryRun = false } = {}) {
  const ps = [
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" |",
    'ForEach-Object { "{0}|{1}|{2}" -f $_.ProcessId, $_.ParentProcessId, ($_.CommandLine -match \'--type=renderer\') }',
  ].join(' ');
  let rows = [];
  try {
    rows = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 30_000 })
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .map((l) => { const [pid, parent, isRenderer] = l.split('|'); return { pid: Number(pid), parent: Number(parent), isRenderer: /true/i.test(isRenderer) }; });
  } catch {
    return { checked: 0, orphans: [], killed: [], error: 'process enumeration failed' };
  }
  const livePids = new Set(rows.map((r) => r.pid));
  const orphans = rows.filter((r) => r.isRenderer && !livePids.has(r.parent));
  const killed = [];
  if (!dryRun) {
    for (const o of orphans) {
      try { process.kill(o.pid, 'SIGKILL'); killed.push(o.pid); } catch { /* already gone or not ours */ }
    }
  }
  return { checked: rows.length, orphans: orphans.map((o) => o.pid), killed };
}

/** Throws if the browser is not the same one a measurement started against. */
export function assertSameBrowser(startIdentity, nowIdentity) {
  if (startIdentity && nowIdentity && startIdentity !== nowIdentity) {
    throw new Error(`SEGMENT ROLL DURING MEASUREMENT: the soak browser was replaced mid-observation (${startIdentity.slice(-12)} -> ${nowIdentity.slice(-12)}). The measurement is void, not empty.`);
  }
}
