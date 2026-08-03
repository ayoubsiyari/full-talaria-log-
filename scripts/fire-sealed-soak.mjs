#!/usr/bin/env node
/**
 * Fire the sealed two-arm soak. Everything is fixed except --expectDigest, which cannot be known until
 * B cuts.
 *
 * This is a launcher, and the reason it exists as its own file with its own checks is that the last
 * launcher in this codebase had never once run: launchDetached built its PowerShell command with
 * JSON.stringify, produced backslash-escaped quotes PowerShell does not parse, and returned a silent
 * ok=false. Every "detached" run to date was actually a WMI call typed at the shell by hand. So this
 * script does not trust its own launch - it waits for the heartbeat to appear and reports the child's
 * real pid, and a launch that produces no heartbeat is a FAILURE here rather than a discovery ten hours
 * later against an empty file.
 *
 * SEQUENCING: the arms run SEQUENTIALLY, not together. B measured the host at 85% CPU with one arm up,
 * and two concurrent arms would make each the other's contention - the defect that marked segment 2 of
 * the salvaged soak. This script refuses to start the second arm while the first is live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchDetached, inspectRun } from './lib/detach01.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';
import { assertArmsComparable } from './lib/arm-equality.mjs';
import { readHostClearance, gradeHostClearance } from './lib/host-clearance.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM = argOf('arm', '');
const DIGEST = argOf('expectDigest', '');
const HOURS_OVERRIDE = argOf('hours', '');
// SPEED-01: the ladder is the integers 1..10 as bars per second. Refused here as well as in the soak,
// because the launcher is what a person actually types and the point of a gate is to fire before the
// ten hours start, not to be discovered inside them.
const SPEED_LADDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SPEED = argOf('speed', '10');
const ORIGIN = argOf('origin', 'http://31.97.192.82:3000');
const HEAP_CAP = argOf('heapCapMB', '1024');
const ALLOW_CONCURRENT = process.argv.includes('--allowConcurrent');
// Rehearsal permits three overrides that are otherwise pinned. Without the flag every parameter below is
// fixed, so a real firing cannot drift between arms by a stray argument.
// A BADGE IS NOT A BUILD IDENTITY, and the rule is executable rather than advisory: there is no way to
// pin a run by badge, and asking to is refused by name.
if (!SPEED_LADDER.includes(Number(SPEED))) {
  console.error(`REFUSED: --speed=${SPEED} is not on the SPEED-01 ladder.`);
  console.error(`  Valid speeds are the integers ${SPEED_LADDER[0]}..${SPEED_LADDER[SPEED_LADDER.length - 1]}, in BARS PER SECOND.`);
  console.error('  Refused rather than clamped because the PRODUCT clamps: migration snaps to the nearest rung, so an');
  console.error('  out-of-range request yields a healthy run whose every record names a speed it never ran at.');
  process.exit(6);
}
if (process.argv.some((a) => a.startsWith('--expectBadge'))) {
  console.error('REFUSED: there is no --expectBadge. A badge is not a build identity — the origin served');
  console.error('  20260802b121 under two different source commits on 2026-08-01, seven hours apart.');
  console.error('  Pin --expectDigest (what the bytes are) and the source commit SHA (which tree made them).');
  process.exit(2);
}

/**
 * TOOL-03 HOST CLEARANCE, gated rather than ruled.
 *
 * "Separate the measurement host from the dev host" has been the rule for months and was never
 * enforceable, so an arm ran at 1.2% headroom and the bend it produced had to be explained from a
 * post-mortem. The floor is checked before anything launches, and the refusal names WHO to close: the
 * environment is normally the eater, not the lanes (IDE 10.0 GB against 2.1 GB of lanes, measured).
 *
 * --minFreeMB / --minFreePercent tune it; --skipHostClearance exists and is deliberately loud, because
 * a gate with no override gets commented out and a gate whose override is silent gets used by default.
 */
const MIN_FREE_MB = Number(argOf('minFreeMB', '8192'));
const MIN_FREE_PCT = Number(argOf('minFreePercent', '25'));
const SKIP_HOST_CLEARANCE = process.argv.includes('--skipHostClearance');

const DRY_RUN = process.argv.includes('--dryRun');
const REHEARSAL = process.argv.includes('--rehearsal');
// SMOKE: the real harness, the real origin, the real seal — only the duration and the output path differ.
// 18 late cherry-picks are a regression surface the morning's plan did not carry, and a replay path that
// breaks at hour two costs the night. Twenty minutes buys the same answer for twenty minutes.
const SMOKE = process.argv.includes('--smoke');
const SEAL_ORIGIN = argOf('sealOrigin', '');
const SAMPLE_MS = argOf('sampleMs', '');
if (!REHEARSAL && SEAL_ORIGIN) {
  console.error('REFUSED: --sealOrigin is rehearsal-only. A real firing and a smoke both seal against the origin they measure.');
  process.exit(2);
}
if (!REHEARSAL && !SMOKE && SAMPLE_MS) {
  console.error('REFUSED: --sampleMs is pinned on a real firing.');
  process.exit(2);
}
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';

// Per-arm hours: the zero-trade arm is 3-4 h, not "short" - it is the clean bar-driven axis with the
// trade term absent by construction, and R3 needs enough span to distinguish a plateau from a slow climb.
const prefix = REHEARSAL ? 'REHEARSAL' : (SMOKE ? 'SMOKE' : 'SEALED');
const ARMS = {
  // TRADE-GOVERNOR-V2, ruled 2026-08-03 16:26+01:00: 30 closed round-trips/hour, one every 120 s,
  // 300 orders across the 10 h arm. Replaces 20/hour. Still a CERTIFICATION workload, not a stress
  // test — the rate has to be one a real trader could produce, or the seal quotes a different claim
  // than the one it thinks it is quoting.
  trades: { closesPerHour: '30', hours: SMOKE ? '0.34' : '10', out: path.join(EV, `${prefix}-SOAK-TRADES.jsonl`) },
  // Unchanged, and deliberately so: zero is the control that removes the trade term by construction.
  zerotrade: { closesPerHour: '0', hours: SMOKE ? '0.34' : '3.5', out: path.join(EV, `${prefix}-SOAK-ZEROTRADE.jsonl`) },
};

if (!ARMS[ARM]) {
  console.error('usage: fire-sealed-soak.mjs --arm=trades|zerotrade --expectDigest=<digest from B\'s cut>');
  process.exit(2);
}

/**
 * ARM-EQUALITY-01. Checked at the fire of EITHER arm, because the asymmetry has to be caught before
 * any host time is spent rather than in the analysis twenty hours later. With within-arm
 * separability predicted to fail, the between-arm delta is the whole attribution, and a second
 * difference makes it uninterpretable with nothing left in reserve.
 */
{
  const armVerdict = assertArmsComparable(ARMS.trades, ARMS.zerotrade);
  if (armVerdict.shouldRefuse) {
    console.error(`REFUSED — ARM-EQUALITY-01 ${armVerdict.state}`);
    console.error(`  ${armVerdict.reason}`);
    for (const d of armVerdict.differences) {
      console.error(`  DIFFERS  ${d.field}: trades=${d.a}  zerotrade=${d.b}`);
    }
    console.error('  Fix the config so the arms differ ONLY in closesPerHour, or record a ruling that');
    console.error('  the pair is not being used for between-arm attribution. Do not fire past this.');
    process.exit(2);
  }
  console.log(`[fire] ARM-EQUALITY-01 ${armVerdict.state} — ${armVerdict.reason}`);
}
if (!DIGEST) {
  console.error('REFUSED: --expectDigest is empty.');
  console.error('  This is the single blank in the staged command and it is deliberately not defaulted.');
  console.error('  An unpinned soak records ten hours against whatever bytes happened to be served, which');
  console.error('  is exactly what SOAK-SEAL exists to prevent. Fill it from B\'s cut and re-run.');
  process.exit(2);
}

/**
 * Refuse to stack runs.
 *
 * The first version skipped the arm being launched (`if (name === ARM) continue`), so it guarded against
 * the OTHER arm and not against a second copy of ITSELF. The dress rehearsal produced exactly that: two
 * children with different --hours appending to one JSONL, interleaving two series into a file that would
 * read as one. A double-fire tonight - a stray second launch, an automation, a scrolled-back shell - would
 * have corrupted ten hours in a way that is very hard to see afterwards.
 *
 * Same-arm is now the STRICTER case: a live process holding the output file means refuse. A stale
 * heartbeat whose pid is gone is a crashed run and is legitimately resumable.
 */
function liveHolder(out) {
  const hbPath = out.replace(/\.jsonl$/, '.heartbeat.json');
  if (!fs.existsSync(hbPath)) return null;
  let hb;
  try { hb = JSON.parse(fs.readFileSync(hbPath, 'utf8')); } catch { return null; }
  if (!hb?.pid) return null;
  let alive = false;
  try { process.kill(hb.pid, 0); alive = true; } catch { alive = false; }
  if (!alive) return null;
  const ageSec = (Date.now() - new Date(hb.lastSampleAt || hb.startedAt || 0).getTime()) / 1000;
  return { pid: hb.pid, ageSec: Math.round(ageSec), samples: hb.samples };
}

const cfg = ARMS[ARM];
if (!ALLOW_CONCURRENT) {
  const self = liveHolder(cfg.out);
  if (self) {
    console.error(`REFUSED: the ${ARM} arm is ALREADY RUNNING as pid ${self.pid} (${self.samples} samples, last heartbeat ${self.ageSec}s ago),`);
    console.error(`  and it holds ${cfg.out}. A second child appending to the same file interleaves two`);
    console.error('  series into one artifact. Stop that run first, or pass --allowConcurrent deliberately.');
    process.exit(2);
  }
  for (const [name, other] of Object.entries(ARMS)) {
    if (name === ARM) continue;
    const held = liveHolder(other.out);
    if (held) {
      console.error(`REFUSED: the ${name} arm is running as pid ${held.pid}. The arms run sequentially - two`);
      console.error('  concurrent arms contend for one host and each becomes the other\'s confound.');
      process.exit(2);
    }
  }
}

// The log is diagnostics; the JSONL is the measurement. A stale log handle (a dead launch's redirect can
// sit in delete-pending and refuse to be renamed) must not be able to block a fire, so the log ROTATES to
// a fresh name while the series and heartbeat still refuse to be overwritten.
let logFile = cfg.out.replace(/\.jsonl$/, '.log');
try {
  if (fs.existsSync(logFile)) { fs.renameSync(logFile, `${logFile}.prior-${Date.now()}`); }
} catch {
  logFile = cfg.out.replace(/\.jsonl$/, `.${Date.now()}.log`);
}
const HOURS = ((REHEARSAL || SMOKE) && HOURS_OVERRIDE) ? HOURS_OVERRIDE : cfg.hours;
const pinnedSha = await smokeTransferGate();
const args = [
  `--arm=${ARM}`, `--hours=${HOURS}`, `--speed=${SPEED}`,
  `--closesPerHour=${cfg.closesPerHour}`, `--origin=${ORIGIN}`,
  `--out=${cfg.out}`, `--expectDigest=${DIGEST}`,
  '--requireSha=1',                       // PASSPORT-3: refuse rather than record a null for ten hours
  `--heapCapMB=${HEAP_CAP}`,              // TOOL-01
];
// --expectSha existed in the soak and NOTHING EVER PASSED IT, so the run pinned whatever SHA happened to
// be live at boot instead of the one the smoke validated. Present but unbound — the defect class the
// binding mutants exist to catch, found in my own launcher.
if (pinnedSha) args.push(`--expectSha=${pinnedSha}`);
if (REHEARSAL && SEAL_ORIGIN) args.push(`--sealOrigin=${SEAL_ORIGIN}`);
if ((REHEARSAL || SMOKE) && SAMPLE_MS) args.push(`--sampleMs=${SAMPLE_MS}`);
// A twenty-minute smoke should not spend its last minute writing a heap snapshot it will never read.
if (SMOKE) args.push('--endSnapshot=0');
// N3 rides the smoke only. The ten-hour arms are judged on delivery rate, and punching a deliberate
// outage into the series that verdict is computed from would be self-inflicted.
  if (SMOKE) args.push('--offlineProbe=1');
  // DRAW-SMOKE-01 rides the smoke only, for the same reason: it writes storage, and the ten-hour arms
  // publish storage-retention figures. It costs no extra page load -- it plants before the refresh the
  // arm already performs and reads back after it.
  if (SMOKE) args.push('--drawingsSmoke=1');

console.log(`arm:      ${ARM}`);
console.log(`digest:   ${DIGEST}`);
console.log(`out:      ${cfg.out}`);
console.log(`command:  node --max-old-space-size=${HEAP_CAP} scripts/sealed-two-arm-soak.mjs ${args.join(' ')}`);

/**
 * RESUME, not archive.
 *
 * This block used to rename the existing series aside on every launch. That is correct for a fresh
 * firing and catastrophic for the case the whole harness exists to survive: relaunching after a crash at
 * hour eight would have moved eight hours of samples out of the way and started an empty file, with
 * DETACH-01's resume and segment-boundary machinery working perfectly on a series nobody would ever join.
 * The dress rehearsal caught it, which is the point of a dress rehearsal.
 *
 * An existing series is resumed when it was measuring the SAME build; a different pinned digest means a
 * different series and is archived. --fresh forces archival.
 */
const FRESH = process.argv.includes('--fresh');
let resuming = false;
if (fs.existsSync(cfg.out) && !FRESH) {
  let priorDigest = null;
  try {
    const first = fs.readFileSync(cfg.out, 'utf8').split('\n').find((l) => l.includes('"__meta"'));
    priorDigest = first ? JSON.parse(first)?.seal?.digest ?? null : null;
  } catch { priorDigest = null; }
  resuming = priorDigest === DIGEST;
  if (!resuming) {
    console.log(`existing series pinned to ${priorDigest ?? 'an unreadable digest'}, not ${DIGEST} — archiving it rather than joining two builds`);
  }
}
if (!resuming) {
  for (const f of [cfg.out, cfg.out.replace(/\.jsonl$/, '.heartbeat.json')]) {
    if (!fs.existsSync(f)) continue;
    try {
      fs.renameSync(f, `${f}.prior-${Date.now()}`);
    } catch (err) {
      // A previous run still holding the handle used to throw here and take the launcher with it, as an
      // unhandled ENOTEMPTY/EPERM stack rather than a stated reason. A launcher must fail legibly.
      console.error(`REFUSED: cannot archive ${path.basename(f)} — ${String(err.code || err).slice(0, 60)}.`);
      // Name the holder. Killing the detached node child leaves its cmd.exe wrapper alive holding the
      // redirect handle, which is invisible unless you go looking for it.
      try {
        const ps = `Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(cfg.out)}*' } | ForEach-Object { $_.ProcessId }`;
        const held = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 20000 });
        const pids = String(held.stdout || '').trim().split(/\s+/).filter(Boolean);
        if (pids.length) console.error(`  HELD BY cmd.exe wrapper pid ${pids.join(', ')} — a detached launch whose child died while its wrapper lived on.`);
        else console.error('  No cmd.exe wrapper matched; something else holds it.');
      } catch { console.error('  Could not identify the holder.'); }
      console.error('  A crash RESUME does not archive, so this only blocks a FRESH fire. Clear the wrapper and retry.');
      process.exit(2);
    }
  }
} else {
  console.log('RESUMING the existing series — prior samples are preserved and the restart is recorded as a segment boundary');
}

/**
 * SMOKE TRANSFER GATE — a real firing may only run on the build the smoke actually passed.
 *
 * RULE, from the 22:00 ruling: pin the DIGEST and the SHA, never the badge. The origin served
 * `20260802b121` under two different source commits today, seven hours apart. Anything that gated on the
 * badge would have called those the same build and carried a smoke result across a tree it never saw.
 *
 * So: the smoke records the digest and SHA it validated; the fire re-reads the origin and refuses unless
 * BOTH still match. A changed SHA under an unchanged badge is a new build and the smoke does not transfer.
 */
async function smokeTransferGate() {
  if (REHEARSAL || SMOKE) return '';
  const gradeFile = path.join(EV, `BUILD-SMOKE-GRADE-${ARM}.json`);
  if (!fs.existsSync(gradeFile)) {
    console.error(`REFUSED: no smoke grade at ${gradeFile}.`);
    console.error('  18 late cherry-picks land before this seal. A ten-hour unattended run does not start');
    console.error('  on a build that has not been through the harness for twenty minutes first.');
    process.exit(5);
  }
  let grade;
  try { grade = JSON.parse(fs.readFileSync(gradeFile, 'utf8')); } catch (err) {
    console.error(`REFUSED: the smoke grade at ${gradeFile} is unreadable (${String(err).slice(0, 120)}).`);
    process.exit(5);
  }
  if (grade.verdict === 'DO NOT FIRE') {
    console.error(`REFUSED: the smoke graded DO NOT FIRE. Failed gates: ${(grade.gates || []).filter((g) => g.state === 'FAIL').map((g) => g.name).join('; ')}`);
    process.exit(5);
  }

  const live = await computeSeal(ORIGIN);
  const liveInfo = await readBuildInfo(ORIGIN);
  const smokeDigest = grade.build?.digest ?? null;
  const smokeSha = grade.build?.sourceCommitSha ?? null;

  if (!smokeDigest || !smokeSha) {
    console.error('REFUSED: the smoke grade does not carry both a digest and a source commit SHA, so there is');
    console.error('  nothing to transfer. A badge alone is not a build identity.');
    process.exit(5);
  }
  if (live.digest !== smokeDigest) {
    console.error(`REFUSED: the smoke passed on digest ${smokeDigest}; the origin now serves ${live.digest}.`);
    console.error('  Different bytes. The smoke does not transfer — re-run it against the build you intend to measure.');
    process.exit(5);
  }
  if (!liveInfo.ok) {
    console.error(`REFUSED: the origin's source commit is unreadable [${liveInfo.state}], so the SHA half of the`);
    console.error('  seal cannot be checked against the smoke.');
    process.exit(5);
  }
  if (String(liveInfo.sourceCommitSha).toLowerCase() !== String(smokeSha).toLowerCase()) {
    console.error(`REFUSED: SAME BYTES OR NOT, THE SOURCE MOVED. The smoke passed on ${smokeSha};`);
    console.error(`  the origin is now built from ${liveInfo.sourceCommitSha} (badge ${live.badge}).`);
    console.error('  A badge is not a build identity — b121 carried two different source trees today.');
    console.error('  This is a NEW BUILD and the smoke does not transfer.');
    process.exit(5);
  }
  if (DIGEST !== smokeDigest) {
    console.error(`REFUSED: --expectDigest is ${DIGEST} but the smoke passed on ${smokeDigest}.`);
    process.exit(5);
  }
  const sha = String(liveInfo.sourceCommitSha).toLowerCase();
  console.log(`smoke transfers: digest ${smokeDigest} and source commit ${sha.slice(0, 12)} both unchanged since the smoke (badge ${live.badge}, not gated on).`);
  return sha;
}

/**
 * HOST CLEARANCE — the last gate before launch, because it is the only one whose answer can change in
 * the minutes between typing the command and the arm starting.
 */
const clearance = readHostClearance();
const cleared = gradeHostClearance(clearance, { minFreeMB: MIN_FREE_MB, minFreePercent: MIN_FREE_PCT });
console.log(`host clearance: ${cleared.state} — ${cleared.why}`);
if (clearance.byOwner) {
  console.log(`  by owner: IDE ${clearance.byOwner.ide} MB · PO apps ${clearance.byOwner.poApps} MB · lanes ${clearance.byOwner.lanes} MB · other ${clearance.byOwner.other} MB`);
}
for (const s of (clearance.staleRunners || [])) console.log(`  stale runner: pid ${s.pid} up ${s.ageHours} h running ${s.script} (${s.mb} MB)`);

if (!cleared.ok) {
  if (SKIP_HOST_CLEARANCE) {
    console.warn('\n*** HOST CLEARANCE OVERRIDDEN with --skipHostClearance ***');
    console.warn(`  ${cleared.why}`);
    console.warn('  The arm will compete with the environment for the memory it is measuring. Any bend in the');
    console.warn('  memory series from this run is UNATTRIBUTABLE between the product and the host.');
  } else {
    console.error(`\nREFUSED: the host is not clear — ${cleared.why}`);
    for (const a of (cleared.action || [])) console.error(`  ${a}`);
    console.error('\n  TOOL-03: the measurement host and the dev host must be separated. This resolves in sequence,');
    console.error('  not with a second machine — lanes stand down, the PO closes their own applications, stale');
    console.error('  runners are ended. The gate names them; it deliberately does NOT kill them, because a sweep');
    console.error('  of this host at 13:07 took a live measurement with it.');
    console.error('\n  Re-run when clear, or --skipHostClearance to proceed with the caveat recorded.');
    process.exit(8);
  }
}

// --dryRun runs every gate and stops before launching. This is how the gates get exercised, and how the
// fire gets verified at 01:00 without spending a launch to find out.
if (DRY_RUN) {
  console.log('\nDRY RUN — all gates passed, nothing launched.');
  console.log(`  arm ${ARM}, digest ${DIGEST}, source commit ${pinnedSha || '(not pinned: rehearsal/smoke)'}`);
  console.log(`  would run ${HOURS} h at speed ${SPEED}, ${cfg.closesPerHour} closes/h, cap ${HEAP_CAP} MB`);
  console.log(`  out ${cfg.out}`);
  process.exit(0);
}

// Snapshot the pre-launch heartbeat so the launch proof can require it to move, not merely to exist.
let priorHeartbeat = null;
try {
  const hbPath = cfg.out.replace(/\.jsonl$/, '.heartbeat.json');
  if (fs.existsSync(hbPath)) priorHeartbeat = JSON.parse(fs.readFileSync(hbPath, 'utf8'));
} catch { priorHeartbeat = null; }

const res = launchDetached('scripts/sealed-two-arm-soak.mjs', args, { cwd: process.cwd(), logFile, heapCapMB: Number(HEAP_CAP) });
if (!res.ok) {
  console.error(`\nLAUNCH FAILED: ${res.error}`);
  process.exit(1);
}
console.log(`\nlaunched via ${res.launcherPid ? `WMI, launcher pid ${res.launcherPid}` : 'WMI'}`);

// Do not report success on the launch call alone - that is precisely the assumption that hid a launcher
// which had never worked. Wait for the run to prove itself by writing a heartbeat.
// On a RESUME a heartbeat already exists, so "a heartbeat appeared" proves nothing - the first version of
// this check read the dead run's file and reported the killed pid as ALIVE. The proof has to be that the
// heartbeat CHANGED: a new pid, or a newer timestamp than the one recorded before the launch.
const deadline = Date.now() + 180000;
let seen = null;
while (Date.now() < deadline) {
  const st = inspectRun(cfg.out, { staleSec: 900 });
  const moved = st.state !== 'NEVER STARTED'
    && (priorHeartbeat == null || st.pid !== priorHeartbeat.pid || String(st.lastSampleAt ?? '') !== String(priorHeartbeat.lastSampleAt ?? '') || String(st.startedAt ?? '') !== String(priorHeartbeat.startedAt ?? ''));
  if (moved) { seen = st; break; }
  await new Promise((r) => setTimeout(r, 3000));
}
if (!seen) {
  console.error('\nLAUNCH UNPROVEN: no heartbeat appeared within 180 s.');
  console.error(`  Read ${logFile} - the child may have refused on the digest (exit 2), the source commit`);
  console.error('  (exit 3), or the heap cap (exit 4), each of which is a correct refusal, not a crash.');
  process.exit(1);
}
console.log(`heartbeat: ${seen.state}, child pid ${seen.pid ?? '(unreported)'}`);
console.log('\nSoak is live and detached. It survives this shell closing.');
process.exitCode = 0;
