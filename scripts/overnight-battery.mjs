#!/usr/bin/env node
/**
 * OVERNIGHT-BATTERY — the NIGHT-01 driver (ruling 776923bde).
 *
 * NIGHT-01 compliance is the whole point of this file:
 *  - SERIAL. One scenario at a time, never two heavy sessions at once.
 *  - MEMORY-CAPPED. Every child gets an explicit --max-old-space-size, so an OOM is a loud
 *    non-zero exit rather than a disappearance.
 *  - A DEATH IS RECORDED, NOT RETRIED. Any non-zero exit, timeout or missing artifact is
 *    recorded VOID with its reason and the queue moves on. There is no relaunch anywhere in
 *    this file, by design: the relaunch loop cost three hours earlier tonight.
 *  - HARD TIMEOUT PER SCENARIO. The window-claim hang produces a process that never exits and
 *    never logs; without a timeout it would eat the whole night. On timeout the process tree is
 *    killed (`taskkill /T`) so orphaned Chrome cannot poison the next scenario.
 *  - NO SYNTHETIC WRITERS. No scenario in this queue plants elements.
 *  - Artifacts go to the shared evidence root (EVID-02), never into the worktree.
 *  - The manifest is written after every state change, so a driver death still leaves a
 *    readable record of what ran.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const REPO = 'c:\\Users\\user\\Desktop\\talaria1\\full-talaria-log--main';
const STAMP = '20260731';

const scenarios = [
  {
    id: 'B1',
    title: 'Mode truth + indicator A/B, SAME BUILD (two indicators arm)',
    why: 'B1 was answered at 01:00-02:30, after the 00:05 ruling was written; its one weakness was cross-build arms (b115 vs b116). This re-runs both arms back to back on one build so the A/B is same-build.',
    script: 'scripts/indicator-decay-ab.mjs',
    args: ['--arm=2', '--minutes=15', '--speed=60', '--mode=candle'],
    out: `B1-INDICATOR-AB-SAMEBUILD-ARM2-${STAMP}.json`,
    maxOldSpaceMb: 1536,
    timeoutMin: 32,
  },
  {
    id: 'B1b',
    title: 'Indicator A/B, SAME BUILD (zero indicators arm)',
    why: 'The zero arm of the same-build A/B. Run as its own process so a window-claim hang costs one arm, not both.',
    script: 'scripts/indicator-decay-ab.mjs',
    args: ['--arm=0', '--minutes=15', '--speed=60', '--mode=candle'],
    out: `B1-INDICATOR-AB-SAMEBUILD-ARM0-${STAMP}.json`,
    maxOldSpaceMb: 1536,
    timeoutMin: 32,
  },
  {
    id: 'B2',
    title: 'Recalc cadence and cost growth IN TICK MODE',
    why: 'B2 in candle mode was answered at 01:00 (cadence 1.00 per candle over 32 windows, recalc cost BOUNDED 0.714->0.750 ms). Re-running candle would re-learn a banked number, so this runs the same measurement in TICK mode, which has never been measured and where the 20x per-bar cost is unattributed.',
    script: 'scripts/replay-mode-truth.mjs',
    args: ['--minutes=16', '--speed=60', '--indicators=2', '--set-mode=tick'],
    out: `B2-RECALC-CADENCE-TICKMODE-${STAMP}.json`,
    maxOldSpaceMb: 1536,
    timeoutMin: 26,
  },
  {
    id: 'B3',
    title: 'Copies per bar + resident bars at first paint',
    why: 'The discriminator named in the ruling: resident bar-like objects across every array and realm over distinct visible bars, at 0/5/15 min, plus resident bars at first paint before any playback.',
    script: 'scripts/bar-copies-census.mjs',
    args: ['--minutes=16', '--speed=60'],
    out: `B3-BAR-COPIES-CENSUS-${STAMP}.json`,
    maxOldSpaceMb: 2048,
    timeoutMin: 34,
  },
  {
    id: 'B4',
    title: 'Distance eviction probe (does anything ever release a bar?)',
    why: 'EVICT-03: are bars far behind the playhead and far outside the viewport still resident? Flat "never released" is a finding; so is "capped but too generous".',
    script: 'scripts/bar-eviction-probe.mjs',
    args: ['--minutes=14', '--speed=60'],
    out: `B4-BAR-EVICTION-PROBE-${STAMP}.json`,
    maxOldSpaceMb: 2048,
    timeoutMin: 24,
  },
  {
    id: 'B5',
    title: 'Visual sweep contact sheet for the PO',
    why: 'Turns an hour of PO clicking into five minutes of PO looking: every drawing tool icon, toolbars, settings panels, order panel, context menus, default and active, single chart and multichart.',
    script: 'scripts/ui-contact-sheet.mjs',
    args: [],
    out: `B5-UI-CONTACT-SHEET-${STAMP}.json`,
    maxOldSpaceMb: 1536,
    timeoutMin: 32,
  },
  {
    id: 'B6',
    title: 'CONF-01/CONF-02 duration soak, whatever hours remain',
    why: 'The soak that has been cut short five times. Last, because the decisive answers are banked by now and this is the run that can afford to be interrupted.',
    script: 'scripts/conf01-duration-gate.mjs',
    args: [],           // hours are computed at launch from the remaining budget
    out: `B6-CONF01-DURATION-SOAK-${STAMP}.json`,
    maxOldSpaceMb: 2048,
    timeoutMin: null,   // computed
    isSoak: true,
  },
];

function nowIso() { return new Date().toISOString(); }
function hhmm() { return new Date().toTimeString().slice(0, 8); }

function killTree(pid) {
  try { execSync(`taskkill /T /F /PID ${pid}`, { stdio: 'ignore' }); } catch { /* already gone */ }
}
function killStrayChrome() {
  // An orphaned Chrome from a killed scenario would compete with the next one for RAM and
  // for the window claim, which is exactly how tonight's contention started.
  try { execSync('taskkill /F /IM chrome.exe', { stdio: 'ignore' }); } catch { /* none running */ }
}
function freeMemGb() {
  // wmic is absent on this Windows build, so CIM via PowerShell is the only reading available.
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"',
      { encoding: 'utf8', timeout: 15_000 },
    );
    const kb = Number(String(out).trim());
    return Number.isFinite(kb) && kb > 0 ? +(kb / 1048576).toFixed(2) : null;
  } catch { return null; }
}

async function runScenario(s, manifest, manifestPath) {
  const entry = {
    id: s.id,
    title: s.title,
    why: s.why,
    startedAt: nowIso(),
    command: `node --max-old-space-size=${s.maxOldSpaceMb} ${s.script} ${s.args.join(' ')}`,
    artifact: path.join(EVIDENCE, s.out),
    logPath: path.join(EVIDENCE, s.out.replace(/\.json$/, '.log')),
    timeoutMin: s.timeoutMin,
    freeGbAtStart: freeMemGb(),
    status: 'RUNNING',
  };
  manifest.scenarios.push(entry);
  const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
  save();
  console.error(`\n[battery] ${hhmm()} ${s.id} START — ${s.title} (timeout ${s.timeoutMin} min, free ${entry.freeGbAtStart} GB)`);

  killStrayChrome();
  const logFd = fs.openSync(entry.logPath, 'a');
  const child = spawn(process.execPath, [
    `--max-old-space-size=${s.maxOldSpaceMb}`,
    s.script,
    ...s.args,
    `--out=${entry.artifact}`,
  ], { cwd: REPO, stdio: ['ignore', logFd, logFd], windowsHide: true });

  entry.pid = child.pid;
  save();

  const finished = await new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      console.error(`[battery] ${hhmm()} ${s.id} TIMEOUT at ${s.timeoutMin} min — killing tree ${child.pid}`);
      killTree(child.pid);
      resolve({ outcome: 'VOID', reason: `timed out after ${s.timeoutMin} min without exiting (window-claim hang shape)` });
    }, s.timeoutMin * 60_000);
    child.on('exit', (code, signal) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(code === 0
        ? { outcome: 'OK', reason: null }
        : { outcome: 'VOID', reason: `exited code=${code} signal=${signal} (a non-zero exit under an explicit heap cap is an OOM or a thrown error, both loud by design)` });
    });
    child.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ outcome: 'VOID', reason: `spawn failed: ${err.message}` });
    });
  });

  try { fs.closeSync(logFd); } catch { /* ignore */ }
  killStrayChrome();

  entry.endedAt = nowIso();
  entry.elapsedMin = +(((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 60_000)).toFixed(1);
  entry.freeGbAtEnd = freeMemGb();
  entry.artifactExists = fs.existsSync(entry.artifact);
  entry.artifactKb = entry.artifactExists ? +(fs.statSync(entry.artifact).size / 1024).toFixed(1) : 0;
  // A clean exit with no artifact is still VOID: the scenario proved nothing.
  if (finished.outcome === 'OK' && !entry.artifactExists) {
    entry.status = 'VOID';
    entry.reason = 'exited 0 but wrote no artifact';
  } else if (finished.outcome === 'OK') {
    entry.status = 'OK';
  } else {
    entry.status = 'VOID';
    entry.reason = finished.reason;
    // A partial artifact is worth keeping: these instruments write incrementally.
    entry.partialArtifactRetained = entry.artifactExists;
  }
  entry.tail = readTail(entry.logPath, 24);
  save();
  console.error(`[battery] ${hhmm()} ${s.id} ${entry.status}${entry.reason ? ` — ${entry.reason}` : ''} (${entry.elapsedMin} min, artifact ${entry.artifactKb} KB)`);
  return entry;
}

function readTail(file, lines) {
  try {
    const txt = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    return txt.slice(-lines);
  } catch { return []; }
}

/** One line per scenario, verdict first, so the PO needs no JSON. */
function writeSummary(manifest, summaryPath) {
  const verdictLine = (e) => {
    const v = e.verdict || (e.status === 'OK' ? 'OK — see artifact' : `VOID — ${e.reason}`);
    return `| ${e.id} | **${e.status}** | ${v} | ${e.elapsedMin ?? '—'} min |`;
  };
  const ok = manifest.scenarios.filter((s) => s.status === 'OK').length;
  const wrote = [
    '# OVERNIGHT SUMMARY — 2026-07-31',
    '',
    `**Was the night good?** ${ok} of ${manifest.scenarios.length} scenarios returned a usable artifact.`,
    '',
    '| scenario | status | verdict | elapsed |',
    '| --- | --- | --- | --- |',
    ...manifest.scenarios.map(verdictLine),
    '',
    `Driver started ${manifest.startedAt}, last updated ${nowIso()}.`,
    '',
    '_Verdict lines are filled in by the grader pass; a bare "OK — see artifact" means the run',
    'completed but had not been graded when this file was last written._',
    '',
  ].join('\n');
  fs.writeFileSync(summaryPath, wrote);
}

const manifestPath = path.join(EVIDENCE, `OVERNIGHT-MANIFEST-${STAMP}.json`);
const summaryPath = path.join(REPO, 'docs', 'plan3', `OVERNIGHT-SUMMARY-${STAMP}.md`);

const endByArg = process.argv.find((a) => a.startsWith('--end-by='));
const endBy = endByArg ? Date.parse(endByArg.split('=')[1]) : (Date.now() + 6 * 3600_000);

const manifest = {
  signature: 'OVERNIGHT-BATTERY-NIGHT-01',
  ruling: '776923bde',
  startedAt: nowIso(),
  endByPlanned: new Date(endBy).toISOString(),
  freeGbAtStart: freeMemGb(),
  scenarios: [],
};
fs.mkdirSync(EVIDENCE, { recursive: true });

console.error(`[battery] ${hhmm()} NIGHT-01 driver up. Budget ends ${new Date(endBy).toTimeString().slice(0, 8)}. Free ${manifest.freeGbAtStart} GB.`);

for (const s of scenarios) {
  const remainingMin = Math.floor((endBy - Date.now()) / 60_000);
  if (s.isSoak) {
    // The soak takes whatever is left, minus a margin so the summary is always written.
    const soakMin = remainingMin - 12;
    if (soakMin < 25) {
      manifest.scenarios.push({
        id: s.id, title: s.title, status: 'SKIPPED',
        reason: `only ${remainingMin} min left in the budget; a soak shorter than 25 min cannot satisfy DUR-01 and would displace the summary`,
      });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
      continue;
    }
    s.timeoutMin = soakMin + 6;
    s.args = [`--hours=${(soakMin / 60).toFixed(2)}`, '--interval-ms=240000', '--speed=60'];
  } else if (remainingMin < 8) {
    manifest.scenarios.push({
      id: s.id, title: s.title, status: 'SKIPPED',
      reason: `only ${remainingMin} min left in the budget`,
    });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
    continue;
  }
  // eslint-disable-next-line no-await-in-loop -- serial by NIGHT-01, that is the requirement
  await runScenario(s, manifest, manifestPath);
  writeSummary(manifest, summaryPath);
}

manifest.endedAt = nowIso();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
writeSummary(manifest, summaryPath);
console.error(`[battery] ${hhmm()} queue complete. Manifest ${manifestPath}`);
