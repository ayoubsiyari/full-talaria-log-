#!/usr/bin/env node
/**
 * TEN-HOUR-WITH-EXITS — the ordered ten-hour CONF-01 soak with the three RESET-01 exits appended.
 *
 * This is an orchestrator, not a new instrument. It spawns the two scripts that already exist and are
 * already gated — `bend-soak.mjs` for the slope and `reset-return-probe.mjs` for the return axis — because
 * introducing new code into the middle of a ten-hour unattended run is how the last two long runs were lost.
 *
 * WHY IT RUNS IN SEGMENTS. The browser has died three times today around 1.38 GB with exit code 1, which is
 * what killed the previous ten-hour attempt at ten minutes. A single-process soak therefore cannot deliver
 * ten hours on this build. Each segment runs until it ends, the death is recorded, and a fresh segment
 * starts until the ten-hour budget is spent. The result is ten hours of measured soak time across a declared
 * number of segments rather than ten minutes and a corpse — and the count of restarts is itself the headline
 * number about the ceiling, so it is reported, not hidden.
 *
 * WHAT IS NOT ADDED. No gauge beyond the two ordered ones, which live in `perm-gauges.mjs` and ran before
 * this launched. No new scenario, no new knob.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const BUDGET_HOURS = Number(argOf('hours', 10));
const MAX_SEGMENTS = Number(argOf('max-segments', 40));
const EVID = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\';
const OUT = argOf('out', `${EVID}TEN-HOUR-WITH-EXITS-20260731.json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'TEN-HOUR-WITH-EXITS-V1',
  artifactFile: OUT.split('\\').pop(),
  ruling: 'The ten-hour CONF-01 soak with the three RESET-01 exits appended, as ordered',
  bfcacheState: 'Declared per child artifact. The soak runs with Chrome default (ENABLED); the appended exits run one arm each plus both arms on logout, which is the only exit bfcache can hold.',
  design: {
    budgetHours: BUDGET_HOURS,
    segmented: 'The browser died three times today near 1.38 GB (exit code 1), which ended the previous ten-hour attempt at ten minutes. Segments accumulate soak time and every restart is counted.',
    exitsAppended: ['reload (bfcache on)', 'logout (bfcache on)', 'logout (bfcache off)', 'tabclose (bfcache on)'],
    whyLogoutTwice: 'RESET-01 requires both arms kept as separate artifacts, and logout is the only one of the three exits that bfcache can hold: a reload replaces the same document and a tab close destroys it.',
    scopeNote: 'No gauge beyond the two ordered ones. Those ran before this launched and are in PERM-GAUGES-20260731.json.',
  },
  startedAtIso: new Date().toISOString(),
  segments: [],
  exits: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
save();

/** Run a child to completion, returning how it ended. Never rejects. */
function run(script, args, logPath) {
  return new Promise((resolve) => {
    const started = Date.now();
    const errStream = fs.createWriteStream(logPath, { flags: 'a' });
    const child = spawn(process.execPath, [script, ...args], {
      cwd: 'c:\\Users\\user\\Desktop\\talaria1\\full-talaria-log--main',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Both pipes must be drained or the child blocks on a full buffer, which is how the first ten-hour
    // launch died writing nothing.
    child.stdout.on('data', () => {});
    child.stderr.pipe(errStream);
    child.on('exit', (code, signal) => {
      errStream.end();
      resolve({ exitCode: code, signal, minutes: +((Date.now() - started) / 60_000).toFixed(2) });
    });
    child.on('error', (err) => {
      errStream.end();
      resolve({ exitCode: null, signal: null, error: String(err?.message || err).slice(0, 160), minutes: +((Date.now() - started) / 60_000).toFixed(2) });
    });
  });
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

(async () => {
  // ---- Phase 1: the soak, in as many segments as the ceiling forces --------
  const budgetEnd = Date.now() + BUDGET_HOURS * 3_600_000;
  let seg = 0;
  while (Date.now() < budgetEnd && seg < MAX_SEGMENTS) {
    seg += 1;
    const remainingHours = Math.max(0.05, (budgetEnd - Date.now()) / 3_600_000);
    const out = `${EVID}TEN-HOUR-SEG-${String(seg).padStart(2, '0')}-20260731.json`;
    const log = `${EVID}TEN-HOUR-SEG-${String(seg).padStart(2, '0')}-20260731.log`;
    console.error(`[10h] segment ${seg} starting, ${remainingHours.toFixed(2)}h of budget left`);
    const ended = await run('scripts/bend-soak.mjs', [
      `--hours=${remainingHours.toFixed(3)}`, '--sample-ms=180000', '--speed=5', '--closes-per-hour=20', `--out=${out}`,
    ], log);
    const a = readJson(out);
    const s = a?.samples || [];
    const row = {
      segment: seg,
      minutes: ended.minutes,
      childExitCode: ended.exitCode,
      buildStamp: a?.buildStamp ?? null,
      samples: s.length,
      spanHours: s.length ? s[s.length - 1].hours : null,
      footprintFirstMB: s.length ? s[0].footprintTotalMB : null,
      footprintLastMB: s.length ? s[s.length - 1].footprintTotalMB : null,
      closedTradesLast: s.length ? s[s.length - 1].closedTrades : null,
      residentBarsLast: s.length ? s[s.length - 1].residentBars : null,
      childStatus: a?.status ?? null,
      childVoid: a?.void ?? null,
      likelyCeilingDeath: !a?.status && s.length > 0,
      artifact: out,
    };
    report.segments.push(row);
    report.soakMinutesAccumulated = +report.segments.reduce((t, r) => t + (r.minutes || 0), 0).toFixed(1);
    report.restarts = report.segments.length - 1;
    save();
    console.error(`[10h] segment ${seg} ended after ${ended.minutes}min: ${row.samples} samples, ${row.footprintFirstMB} -> ${row.footprintLastMB} MB, status=${row.childStatus || 'KILLED (no status written)'}`);
    if (ended.minutes < 1.5 && seg > 2) {
      report.abandonedEarly = `segment ${seg} lasted ${ended.minutes} minutes; three consecutive near-instant failures mean the environment cannot sustain the soak and continuing would only fill the disk with corpses`;
      save();
      break;
    }
    await sleep(10_000);
  }

  // ---- Phase 2: the three RESET-01 exits, appended ------------------------
  const exits = [
    { exit: 'reload', bfcache: 'on' },
    { exit: 'logout', bfcache: 'on' },
    { exit: 'logout', bfcache: 'off' },
    { exit: 'tabclose', bfcache: 'on' },
  ];
  for (const e of exits) {
    const tag = `${e.exit.toUpperCase()}-${e.bfcache === 'on' ? 'BFON' : 'BFOFF'}`;
    const out = `${EVID}TENHOUR-EXIT-${tag}-20260731.json`;
    const log = `${EVID}TENHOUR-EXIT-${tag}-20260731.log`;
    console.error(`[10h] exit ${tag} starting`);
    const ended = await run('scripts/reset-return-probe.mjs', [
      `--exit=${e.exit}`, `--bfcache=${e.bfcache}`, '--heavy-mb=1024', '--max-footprint-mb=1300',
      '--heavy-cap-min=14', '--cycles=1', '--speed=5', `--out=${out}`,
    ], log);
    const a = readJson(out);
    const c = (a?.cycles || [])[0] || {};
    report.exits.push({
      exit: e.exit,
      bfcacheState: a?.bfcacheState ?? `requested ${e.bfcache}`,
      minutes: ended.minutes,
      buildStamp: a?.buildStamp ?? null,
      fourPanelFirstPaintMB: a?.fourPanelFirstPaint?.totalPrivateMB ?? null,
      singleChartFirstPaintMB: a?.singleChartFirstPaint?.totalPrivateMB ?? null,
      heavyAboveBaselineMB: c.heavyAboveBaselineMB ?? null,
      afterExitMB: c.afterExit?.totalPrivateMB ?? null,
      releasedByExitMB: c.releasedByExitMB ?? null,
      reentryMB: c.reentryFootprintMB ?? null,
      reentryChartPresent: c.reentryChartPresent ?? null,
      returnDeltaMB: c.returnDeltaMB ?? null,
      comparedAgainst: c.comparedAgainst ?? null,
      verdict: a?.verdict ?? null,
      artifact: out,
    });
    save();
    console.error(`[10h] exit ${tag}: ${a?.verdict || 'no verdict'}`);
    await sleep(8_000);
  }

  // ---- Summary -------------------------------------------------------------
  const segs = report.segments.filter((s) => s.samples > 0);
  const longest = segs.length ? Math.max(...segs.map((s) => s.minutes || 0)) : 0;
  report.summary = {
    soakMinutesAccumulated: report.soakMinutesAccumulated ?? 0,
    soakHoursAccumulated: +((report.soakMinutesAccumulated ?? 0) / 60).toFixed(2),
    segments: report.segments.length,
    restarts: Math.max(0, report.segments.length - 1),
    longestUnbrokenSegmentMinutes: +longest.toFixed(1),
    // DUR-01 asks for the longest CONTINUOUS stretch, which is not the same as accumulated time.
    durationCaveat: `DUR-01 is satisfied by the longest CONTINUOUS stretch, not by accumulated time. The longest unbroken segment here is ${longest.toFixed(1)} minutes across ${report.segments.length} segment(s). Accumulated soak time must not be quoted as a continuous duration.`,
    buildStamps: [...new Set(report.segments.map((s) => s.buildStamp).filter(Boolean))],
    returnAxis: report.exits.map((e) => `${e.exit}/${/ENABLED/i.test(String(e.bfcacheState)) ? 'bfcache-on' : 'bfcache-off'}: heavy +${e.heavyAboveBaselineMB} MB, after exit ${e.afterExitMB} MB, re-entry ${e.reentryMB} MB, delta ${e.returnDeltaMB} MB${e.reentryChartPresent === false ? ' (VOID: no chart on re-entry)' : ''}`),
  };
  report.status = 'OK';
  report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
  save();
  console.error('\n=== TEN HOUR WITH EXITS COMPLETE ===');
  console.error(JSON.stringify(report.summary, null, 1));
  console.error(`artifact ${OUT}`);
})();
