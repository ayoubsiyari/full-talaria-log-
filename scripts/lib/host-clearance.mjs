/**
 * HOST CLEARANCE — TOOL-03, enforced instead of ruled.
 *
 * The rule "separate the measurement host from the dev host" has existed for months and was never
 * enforced, so it was rediscovered by measurement: an arm ran with 1.2% headroom and the resulting bend
 * in a memory series had to be explained after the fact from a post-mortem.
 *
 * WHAT THIS IS NOT: a generic "not enough RAM" check. A refusal that cannot say WHO to close is one the
 * operator overrides, and an overridden gate is decoration. The eaters are usually not the lanes at all
 * - the IDE alone has been measured at 6.3 GB across three processes against 1.69 GB for four node
 * runners - so the gate attributes memory by OWNER and names the offenders with their megabytes.
 *
 * IT NAMES, IT DOES NOT KILL. Auto-clearing the host is how a measurement dies: every Chrome on this box
 * was swept at 13:07 by another lane's cleanup and took a live drain run with it. A gate that kills to
 * make room reproduces that failure with more authority. Stale runners are reported with pid, age and
 * script so a human ends them.
 *
 * THE FLOOR IS DERIVED, NOT ROUND. Peak browser footprint across published runs is 3,126 MB (soak
 * salvage segment 1); the harness node process runs under a 1,024 MB old-space cap and has been read at
 * 704 MB. So the arm's own peak demand is ~3.9 GB, and the default floor of 8,192 MB is a shade over 2x
 * that. Below it the arm is competing with the environment for the memory it is trying to measure.
 */

import os from 'node:os';
import { spawnSync } from 'node:child_process';

const MB = 1024 * 1024;

/** Owner classes. chrome.exe is deliberately ambiguous and is resolved per-process by command line. */
const OWNER = {
  IDE: ['cursor.exe', 'code.exe', 'devenv.exe'],
  PO_APPS: ['brave.exe', 'firefox.exe', 'msedge.exe', 'opera.exe', 'discord.exe', 'slack.exe', 'teams.exe', 'spotify.exe', 'steam.exe'],
  LANE: ['node.exe'],
};

function classify(name, cmdline) {
  const n = String(name || '').toLowerCase();
  if (OWNER.IDE.includes(n)) return 'ide';
  if (OWNER.PO_APPS.includes(n)) return 'poApps';
  if (OWNER.LANE.includes(n)) return 'lanes';
  if (n === 'chrome.exe') {
    // A puppeteer browser is a lane's instrument; a hand-opened Chrome is the PO's.
    return /puppeteer_dev_chrome_profile|--remote-debugging-port|--headless/i.test(String(cmdline || '')) ? 'lanes' : 'poApps';
  }
  return 'other';
}

/**
 * Reads processes over a size threshold, plus every node.exe regardless of size so stale runners are
 * visible even when idle and small.
 */
export function readHostClearance({ minReportMB = 100, staleAfterHours = 4, now = Date.now() } = {}) {
  const totalMB = Math.round(os.totalmem() / MB);
  const freeMB = Math.round(os.freemem() / MB);
  const base = {
    at: new Date(now).toISOString(),
    systemTotalMB: totalMB,
    systemFreeMB: freeMB,
    systemHeadroomPercent: totalMB > 0 ? +((freeMB / totalMB) * 100).toFixed(1) : null,
  };

  const ps = [
    "$ErrorActionPreference='SilentlyContinue';",
    `Get-CimInstance Win32_Process | Where-Object { $_.PrivatePageCount -gt ${minReportMB}MB -or $_.Name -eq 'node.exe' } | ForEach-Object {`,
    "  $cl = $_.CommandLine; if ($cl.Length -gt 200) { $cl = $cl.Substring(0,200) };",
    "  '{0}|~|{1}|~|{2}|~|{3}|~|{4}' -f $_.Name, $_.ProcessId, [math]::Round($_.PrivatePageCount/1MB,1), $_.CreationDate.ToString('o'), $cl",
    '}',
  ].join(' ');

  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 40000 });
  if (res.error || res.status !== 0) {
    // A clearance gate that cannot read the host must REFUSE, not wave the run through. An unreadable
    // host is exactly the condition under which the last one was lost.
    return { ...base, readOk: false, why: `could not enumerate processes: ${String(res.error || res.stderr || `exit ${res.status}`).slice(0, 160)}`, byOwner: null, offenders: [], staleRunners: [] };
  }

  const procs = [];
  for (const line of String(res.stdout || '').trim().split(/\r?\n/)) {
    if (!line.includes('|~|')) continue;
    const [name, pid, mb, created, ...rest] = line.split('|~|');
    const cmdline = rest.join('|~|');
    const startedMs = Date.parse(created);
    procs.push({
      name, pid: Number(pid), mb: Number(mb), cmdline,
      ageHours: Number.isFinite(startedMs) ? +((now - startedMs) / 3_600_000).toFixed(2) : null,
      owner: classify(name, cmdline),
    });
  }

  const byOwner = { ide: 0, poApps: 0, lanes: 0, other: 0 };
  for (const p of procs) byOwner[p.owner] = +(byOwner[p.owner] + p.mb).toFixed(1);

  const offenders = procs
    .filter((p) => p.mb >= minReportMB)
    .sort((a, b) => b.mb - a.mb)
    .slice(0, 12)
    .map((p) => ({ name: p.name, pid: p.pid, mb: p.mb, owner: p.owner, ageHours: p.ageHours }));

  // Stale lane runners: old node processes still holding a script. Named, never killed here.
  const staleRunners = procs
    .filter((p) => p.owner === 'lanes' && p.name.toLowerCase() === 'node.exe' && p.ageHours != null && p.ageHours >= staleAfterHours)
    .map((p) => {
      const m = /([\w.-]+\.mjs)/.exec(p.cmdline || '');
      return { pid: p.pid, mb: p.mb, ageHours: p.ageHours, script: m ? m[1] : 'unknown' };
    })
    .sort((a, b) => b.ageHours - a.ageHours);

  return { ...base, readOk: true, byOwner, offenders, staleRunners, processCount: procs.length };
}

/**
 * Grades a clearance reading. Pure, so the self-test drives THIS function with fixtures rather than
 * restating its arithmetic against whatever the host happens to look like today.
 */
export function gradeHostClearance(reading, { minFreeMB = 8192, minFreePercent = 25 } = {}) {
  if (!reading || reading.readOk === false) {
    return { ok: false, state: 'HOST_UNREADABLE', why: `the host could not be read (${reading?.why || 'no reading'}), so clearance is unknown. An unknown host is refused, not assumed clear.`, action: [] };
  }

  const freeMB = reading.systemFreeMB;
  const pct = reading.systemHeadroomPercent;
  const failsMB = Number.isFinite(freeMB) && freeMB < minFreeMB;
  const failsPct = Number.isFinite(pct) && pct < minFreePercent;

  // Both must hold. Percent alone scales wrongly across machines (25% of 8 GB is not enough for a run
  // that peaks near 3.9 GB); absolute alone ignores how much of the box is already committed.
  if (!failsMB && !failsPct) {
    return {
      ok: true, state: 'CLEAR',
      why: `${freeMB} MB free (${pct}%), floor ${minFreeMB} MB and ${minFreePercent}%.`,
      staleRunners: reading.staleRunners || [],
      // Reported even when clear: a stale runner is a scheduling fact, not a blocker.
      note: (reading.staleRunners || []).length ? `${reading.staleRunners.length} stale runner(s) still up; clear on headroom but worth ending.` : null,
    };
  }

  const short = [];
  if (failsMB) short.push(`${freeMB} MB free against a ${minFreeMB} MB floor (short by ${minFreeMB - freeMB} MB)`);
  if (failsPct) short.push(`${pct}% headroom against a ${minFreePercent}% floor`);

  // The actionable half. Sorted biggest-first and grouped by owner, because "close things" is not an
  // instruction and "close Cursor, it is holding 5,095 MB" is.
  const action = [];
  const o = reading.byOwner || {};
  if (o.ide > 0) action.push(`IDE is holding ${o.ide} MB — this is usually the largest single consumer and it is not a lane`);
  if (o.poApps > 0) action.push(`PO applications are holding ${o.poApps} MB (browsers, chat) — not attributable to any lane`);
  if (o.lanes > 0) action.push(`measurement lanes are holding ${o.lanes} MB`);
  for (const s of (reading.staleRunners || [])) action.push(`stale runner pid ${s.pid} up ${s.ageHours} h running ${s.script} (${s.mb} MB) — end it, do not let the gate kill it`);
  for (const f of (reading.offenders || []).slice(0, 5)) action.push(`  ${f.name} pid ${f.pid}: ${f.mb} MB [${f.owner}]`);

  return {
    ok: false,
    state: 'INSUFFICIENT_HEADROOM',
    why: `${short.join('; ')}. A ten-hour arm peaks near 3.9 GB of its own and cannot compete with the environment for it.`,
    action,
    byOwner: o,
    staleRunners: reading.staleRunners || [],
  };
}
