/**
 * HOST HEALTH, joined per sample.
 *
 * The crash that cost a ten-hour run was named after the fact: 16,387 MB of Node across three processes at
 * 99% system memory. That was reconstructed from a post-mortem, because no sample carried the host's state
 * beside the measurement. A soak that records only the browser cannot distinguish "the product grew" from
 * "the host ran out", and those have opposite consequences.
 *
 * Two columns, both cheap: system RAM headroom, and aggregate node.exe footprint (the harness's own
 * weight, which is the thing that actually went to 16 GB).
 */
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const MB = 1024 * 1024;

/**
 * Aggregate private bytes per image name. Uses Get-CimInstance rather than tasklist because tasklist
 * reports working set, which Windows trims under pressure - the same trap that made an orphaned renderer
 * holding 2,489 MB private look like a 1,354 MB release.
 */
function processFootprints() {
  const ps = "Get-CimInstance Win32_Process | Group-Object Name | ForEach-Object { '{0}={1}={2}' -f $_.Name, $_.Count, [math]::Round((($_.Group | Measure-Object PrivatePageCount -Sum).Sum)/1MB,1) }";
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 30000 });
  const out = {};
  for (const line of String(res.stdout || '').trim().split(/\r?\n/)) {
    const [name, count, mb] = line.split('=');
    if (name && mb) out[name.toLowerCase()] = { count: Number(count), mb: Number(mb) };
  }
  return out;
}

export function readHostHealth({ withProcesses = true } = {}) {
  const totalMB = Math.round(os.totalmem() / MB);
  const freeMB = Math.round(os.freemem() / MB);
  const base = {
    systemTotalMB: totalMB,
    systemFreeMB: freeMB,
    systemHeadroomPercent: totalMB > 0 ? +((freeMB / totalMB) * 100).toFixed(1) : null,
    loadAvg1: os.loadavg?.()[0] ?? null,
    at: new Date().toISOString(),
  };
  if (!withProcesses) return { ...base, nodeTotalMB: null, nodeCount: null, chromeTotalMB: null, chromeCount: null, gaugeOk: true };
  try {
    const p = processFootprints();
    const node = p['node.exe'] || { count: 0, mb: 0 };
    const chrome = p['chrome.exe'] || { count: 0, mb: 0 };
    return {
      ...base,
      nodeTotalMB: node.mb, nodeCount: node.count,
      chromeTotalMB: chrome.mb, chromeCount: chrome.count,
      // Named because it is the specific failure that killed a ten-hour run, not a generic threshold.
      nodePressure: node.mb > 8000 ? `node.exe aggregate ${node.mb} MB across ${node.count} processes - the crash that cost a ten-hour run was 16,387 MB across three` : null,
      hostPressure: base.systemHeadroomPercent != null && base.systemHeadroomPercent < 8 ? `system headroom ${base.systemHeadroomPercent}%` : null,
      gaugeOk: true,
    };
  } catch (err) {
    // A failed host read must not stop a soak; it is context, not the dependent variable.
    return { ...base, nodeTotalMB: null, nodeCount: null, chromeTotalMB: null, chromeCount: null, gaugeOk: false, gaugeError: String(err).slice(0, 200) };
  }
}
