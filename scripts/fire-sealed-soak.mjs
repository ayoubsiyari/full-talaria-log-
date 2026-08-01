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

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM = argOf('arm', '');
const DIGEST = argOf('expectDigest', '');
const HOURS_OVERRIDE = argOf('hours', '');
const SPEED = argOf('speed', '60');
const ORIGIN = argOf('origin', 'http://31.97.192.82:3000');
const HEAP_CAP = argOf('heapCapMB', '1024');
const ALLOW_CONCURRENT = process.argv.includes('--allowConcurrent');
// Rehearsal permits three overrides that are otherwise pinned. Without the flag every parameter below is
// fixed, so a real firing cannot drift between arms by a stray argument.
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
  trades: { closesPerHour: '20', hours: SMOKE ? '0.34' : '10', out: path.join(EV, `${prefix}-SOAK-TRADES.jsonl`) },
  zerotrade: { closesPerHour: '0', hours: SMOKE ? '0.34' : '3.5', out: path.join(EV, `${prefix}-SOAK-ZEROTRADE.jsonl`) },
};

if (!ARMS[ARM]) {
  console.error('usage: fire-sealed-soak.mjs --arm=trades|zerotrade --expectDigest=<digest from B\'s cut>');
  process.exit(2);
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
const args = [
  `--arm=${ARM}`, `--hours=${HOURS}`, `--speed=${SPEED}`,
  `--closesPerHour=${cfg.closesPerHour}`, `--origin=${ORIGIN}`,
  `--out=${cfg.out}`, `--expectDigest=${DIGEST}`,
  '--requireSha=1',                       // PASSPORT-3: refuse rather than record a null for ten hours
  `--heapCapMB=${HEAP_CAP}`,              // TOOL-01
];
if (REHEARSAL && SEAL_ORIGIN) args.push(`--sealOrigin=${SEAL_ORIGIN}`);
if ((REHEARSAL || SMOKE) && SAMPLE_MS) args.push(`--sampleMs=${SAMPLE_MS}`);
// A twenty-minute smoke should not spend its last minute writing a heap snapshot it will never read.
if (SMOKE) args.push('--endSnapshot=0');

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
